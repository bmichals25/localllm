/**
 * TTS Service
 * 
 * Service for communicating with the CSM-MLX TTS server.
 */

const TTS_SERVER_URL = 'http://localhost:3001';

/**
 * Context segment for conversation-aware TTS
 */
export interface TTSContext {
  text: string;
  speaker: number;
  audio?: number[]; // Optional audio data
}

/**
 * Options for text-to-speech conversion
 */
export interface TTSOptions {
  text: string;
  speaker?: number;
  temperature?: number;
  top_k?: number;
  max_audio_length_ms?: number;
  context?: TTSContext[];
}

/**
 * Check if the TTS server is ready
 * @returns Promise resolving to true if server is ready, false otherwise
 */
export async function isTTSServerReady(): Promise<boolean> {
  try {
    const response = await fetch(`${TTS_SERVER_URL}/health`);
    const data = await response.json();
    return data.status === 'ready';
  } catch (error) {
    console.error('Error checking TTS server status:', error);
    return false;
  }
}

/**
 * Convert text to speech using the CSM-MLX server
 * 
 * @param options TTS options
 * @returns Promise resolving to the audio URL or null on error
 */
export async function textToSpeech(options: TTSOptions): Promise<string | null> {
  try {
    const { text, speaker = 0, temperature = 0.8, top_k = 50, max_audio_length_ms = 10000, context = [] } = options;
    
    // Check if text is empty
    if (!text.trim()) {
      return null;
    }
    
    // Check if TTS server is ready
    const isReady = await isTTSServerReady();
    if (!isReady) {
      console.error('TTS server is not ready');
      return null;
    }
    
    // Make request to TTS server
    const response = await fetch(`${TTS_SERVER_URL}/tts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        speaker,
        temperature,
        top_k,
        max_audio_length_ms,
        context,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    // Convert response to blob and create a URL
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch (error) {
    console.error('Error converting text to speech:', error);
    return null;
  }
}

/**
 * Play audio from the given URL
 * 
 * @param audioUrl URL of the audio to play
 * @returns Promise that resolves when audio starts playing
 */
export function playAudio(audioUrl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const audio = new Audio(audioUrl);
      audio.onplay = () => resolve();
      audio.onerror = (e) => reject(e);
      audio.play();
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Speak text using the TTS service
 * 
 * @param options TTS options
 * @returns Promise resolving to true if successful, false otherwise
 */
export async function speak(options: TTSOptions): Promise<boolean> {
  try {
    const audioUrl = await textToSpeech(options);
    if (!audioUrl) {
      return false;
    }
    
    await playAudio(audioUrl);
    return true;
  } catch (error) {
    console.error('Error speaking text:', error);
    return false;
  }
} 