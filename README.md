# Local LLM UI

A macOS application for running a local Large Language Model with speech-to-text and text-to-speech capabilities.

## Features

- Connect to locally running Ollama instance
- Chat with LLMs running on your Mac
- Speech-to-Text input using the Web Speech API
- Text-to-Speech output for AI responses
- Modern, responsive UI built with Next.js and Tailwind CSS

## Requirements

- [Ollama](https://ollama.com/) installed on your Mac
- Node.js >= 20.0.0
- A compatible LLM model (e.g., llama3.2) pulled in Ollama

## Setup

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Start the development server:
   ```
   npm run dev
   ```
4. Open your browser to [http://localhost:3000](http://localhost:3000)

## How It Works

This application provides a web UI that connects to a locally running Ollama instance. It sends user messages to Ollama's API and displays the responses.

The application also includes:
- Speech-to-Text: Click the microphone button to speak your message
- Text-to-Speech: Toggle the TTS button to have the AI responses read aloud

## Technologies Used

- Next.js
- React
- TypeScript
- Tailwind CSS
- Web Speech API (for STT and TTS)
- Ollama API
