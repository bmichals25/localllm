

import asyncio
import logging
import os
import tempfile
from typing import List, Optional, Dict, Any

import numpy as np
import audiofile
from fastapi import FastAPI, HTTPException, BackgroundTasks, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("tts-server")

# Initialize FastAPI app
app = FastAPI(title="CSM-MLX TTS API", 
              description="Text-to-Speech API using CSM-MLX for Apple Silicon",
              version="0.1.0")

# Add CORS middleware to allow requests from the Next.js app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variables
model = None
model_loading = False
temp_files = []


class TTSRequest(BaseModel):
    """Request model for text-to-speech conversion."""
    text: str
    speaker: int = 0
    temperature: float = 0.8
    top_k: int = 50
    max_audio_length_ms: int = 10000
    context: List[Dict[str, Any]] = []


@app.on_event("startup")
async def startup_event():
    """Initialize the model on startup."""
    global model_loading
    model_loading = True
    # Start loading the model in the background
    asyncio.create_task(load_model())


@app.on_event("shutdown")
async def shutdown_event():
    """Clean up temporary files on shutdown."""
    for file_path in temp_files:
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception as e:
            logger.error(f"Error removing temp file {file_path}: {e}")


async def load_model():
    """Load the CSM-MLX model asynchronously."""
    global model, model_loading
    try:
        # Import here to avoid slowing down server startup
        from mlx_lm.sample_utils import make_sampler
        from huggingface_hub import hf_hub_download
        from csm_mlx import CSM, csm_1b
        
        logger.info("Loading CSM-MLX model...")
        csm = CSM(csm_1b())
        
        # Download model weights if not already cached
        weight_path = hf_hub_download(
            repo_id="senstella/csm-1b-mlx", 
            filename="ckpt.safetensors"
        )
        logger.info(f"Model weights downloaded from HuggingFace: {weight_path}")
        
        # Load model weights
        csm.load_weights(weight_path)
        logger.info("Model weights loaded successfully")
        
        model = csm
    except Exception as e:
        logger.error(f"Error loading model: {e}")
    finally:
        model_loading = False


@app.get("/")
async def root():
    """Root endpoint to check server status."""
    global model, model_loading
    
    if model_loading:
        return {"status": "loading", "message": "The TTS model is still loading..."}
    elif model is None:
        return {"status": "error", "message": "Failed to load the TTS model"}
    else:
        return {"status": "ready", "message": "TTS server is ready"}


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    global model, model_loading
    
    if model_loading:
        return {"status": "loading"}
    elif model is None:
        return {"status": "error"}
    else:
        return {"status": "ready"}


@app.post("/tts")
async def text_to_speech(request: TTSRequest, background_tasks: BackgroundTasks):
    """
    Convert text to speech using CSM-MLX.
    
    Returns a WAV audio file.
    """
    global model, model_loading
    
    # Check if the model is ready
    if model_loading:
        return JSONResponse(
            status_code=503,
            content={"error": "Model is still loading. Please try again later."}
        )
    elif model is None:
        return JSONResponse(
            status_code=500,
            content={"error": "Model failed to load. Please check server logs."}
        )
    
    try:
        # Import dependencies
        from mlx_lm.sample_utils import make_sampler
        import mlx.core as mx
        from csm_mlx import generate, Segment
        
        # Prepare context if provided
        context = []
        for ctx in request.context:
            if "text" in ctx and "speaker" in ctx:
                # If audio is provided, use it, otherwise use empty array
                audio = mx.array(ctx.get("audio", []))
                context.append(Segment(
                    speaker=ctx["speaker"],
                    text=ctx["text"],
                    audio=audio
                ))
        
        # Create sampler with temperature and top_k
        sampler = make_sampler(temp=request.temperature, top_k=request.top_k)
        
        # Generate audio
        audio = generate(
            model,
            text=request.text,
            speaker=request.speaker,
            context=context,
            max_audio_length_ms=request.max_audio_length_ms,
            sampler=sampler
        )
        
        # Convert to numpy array and save as WAV
        audio_np = np.asarray(audio)
        
        # Create a temporary file for the audio
        fd, temp_path = tempfile.mkstemp(suffix=".wav")
        os.close(fd)
        
        # Keep track of temp files for cleanup
        temp_files.append(temp_path)
        background_tasks.add_task(lambda: temp_files.remove(temp_path) if temp_path in temp_files else None)
        
        # Save audio to the temp file
        audiofile.write(temp_path, audio_np, 24000)
        
        return FileResponse(
            temp_path,
            media_type="audio/wav",
            filename="tts_output.wav",
            background=background_tasks
        )
    
    except Exception as e:
        logger.error(f"Error generating speech: {e}")
        raise HTTPException(status_code=500, detail=f"Error generating speech: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    
    # Get port from environment or use default
    port = int(os.environ.get("TTS_SERVER_PORT", 3001))
    
    uvicorn.run("server:app", host="127.0.0.1", port=port, reload=True)