'use client'; // Required for state and effects

import { useState, useEffect, useRef } from 'react';
import { Settings } from '../components/Settings';

interface Message {
  sender: 'user' | 'ai';
  text: string;
}

// Define the structure for Ollama API request messages
interface OllamaMessage {
  role: 'user' | 'assistant';
  content: string;
}

// Define types for Web Speech API
declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
    speechRecognition?: SpeechRecognition;
  }

  // Speech Recognition types
  interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    start(): void;
    stop(): void;
    abort(): void;
    onstart: (event: Event) => void;
    onend: (event: Event) => void;
    onerror: (event: SpeechRecognitionErrorEvent) => void;
    onresult: (event: SpeechRecognitionEvent) => void;
  }

  interface SpeechRecognitionErrorEvent extends Event {
    error: string;
    message?: string;
  }

  interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
  }

  interface SpeechRecognitionResultList {
    length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
  }

  interface SpeechRecognitionResult {
    length: number;
    item(index: number): SpeechRecognitionAlternative;
    [index: number]: SpeechRecognitionAlternative;
    isFinal?: boolean;
  }

  interface SpeechRecognitionAlternative {
    transcript: string;
    confidence: number;
  }
}

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentModel, setCurrentModel] = useState<string>('llama3.2'); // Default model
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const messagesEndRef = useRef<null | HTMLDivElement>(null);

  // Load saved model preference from localStorage on component mount
  useEffect(() => {
    const savedModel = localStorage.getItem('preferredModel');
    if (savedModel) {
      setCurrentModel(savedModel);
    }
  }, []);

  // Save model preference to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('preferredModel', currentModel);
  }, [currentModel]);

  const handleModelChange = (model: string) => {
    setCurrentModel(model);
  };

  // Updated sendMessage function to interact with Ollama API
  const sendMessage = async () => {
    if (!inputText.trim() || isLoading) return;

    const newUserMessage: Message = { sender: 'user', text: inputText };
    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);
    setInputText('');
    setIsLoading(true);

    // Format messages for Ollama API
    const ollamaMessages: OllamaMessage[] = updatedMessages.map(msg => ({
      role: msg.sender === 'user' ? 'user' : 'assistant', // Map sender to role
      content: msg.text,
    }));

    try {
      const response = await fetch('http://localhost:11434/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: currentModel, // Use the selected model
          messages: ollamaMessages,
          stream: true, // Enable streaming response
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiResponseText = '';
      let firstChunk = true;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        // Ollama streams JSON objects separated by newlines
        const lines = chunk.split('\n').filter(line => line.trim() !== '');
        for (const line of lines) {
          try {
            const parsedLine = JSON.parse(line);
            if (parsedLine.message && parsedLine.message.content) {
              aiResponseText += parsedLine.message.content;

              if (firstChunk) {
                // Add the initial AI message placeholder
                setMessages(prev => [...prev, { sender: 'ai', text: aiResponseText }]);
                firstChunk = false;
              } else {
                // Update the last AI message with the new content
                setMessages(prev => {
                  const lastMsgIndex = prev.length - 1;
                  // Ensure the last message is indeed from the AI before updating
                  if (prev[lastMsgIndex]?.sender === 'ai') {
                    const updated = [...prev];
                    updated[lastMsgIndex] = { ...updated[lastMsgIndex], text: aiResponseText };
                    return updated;
                  } else {
                      // If the last message isn't AI (edge case), append a new one
                      // This might happen if user sends multiple messages rapidly
                      return [...prev, { sender: 'ai', text: aiResponseText}];
                  }
                });
              }
            }
            if (parsedLine.done) {
                // Optional: Handle final stats if needed
                // console.log('Stream finished:', parsedLine);
            }
          } catch (error) {
            console.error('Error parsing streamed JSON line:', error, 'Line:', line);
            // Optionally add an error message to the chat
            setMessages(prev => [...prev, { sender: 'ai', text: `Error processing response: ${error}` }]);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching from Ollama API:', error);
      setMessages(prev => [...prev, { sender: 'ai', text: `Sorry, I couldn't connect to the AI. Error: ${error}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Implement STT (Speech-to-Text) functionality using Web Speech API
  const handleVoiceInput = () => {
    if (isLoading) return; // Don't allow voice input while processing
    
    // Check if browser supports speech recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      console.warn('Browser does not support speech recognition');
      return;
    }
    
    if (isListening) {
      // Stop listening
      window.speechRecognition?.stop();
      setIsListening(false);
      return;
    }
    
    try {
      // Start listening
      const recognition = new SpeechRecognition();
      window.speechRecognition = recognition;
      
      // Configure recognition
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      
      // Set up event handlers
      recognition.onstart = () => {
        console.log('Speech recognition started');
        setIsListening(true);
      };
      
      recognition.onend = () => {
        console.log('Speech recognition ended');
        setIsListening(false);
      };
      
      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
      };
      
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        // Handle speech recognition results
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
          
        // Update the input field with the transcribed text
        setInputText(transcript);
      };
      
      // Start recognition
      recognition.start();
    } catch (error) {
      console.error('Error starting speech recognition:', error);
      setIsListening(false);
    }
  };

  // Implement TTS (Text-to-Speech) functionality using Web Speech API
  const speakText = (text: string) => {
    if (!ttsEnabled) return;
    
    // Check if browser supports speech synthesis
    if ('speechSynthesis' in window) {
      // Create a new utterance
      const utterance = new SpeechSynthesisUtterance(text);
      
      // Optional: Configure voice, rate, pitch, etc.
      // Get available voices
      const voices = window.speechSynthesis.getVoices();
      
      // Try to find a good quality voice - prefer female voice if available
      const preferredVoice = voices.find(voice => 
        voice.lang.includes('en-US') && voice.name.includes('Female')
      ) || voices.find(voice => 
        voice.lang.includes('en-US')
      ) || voices[0];
      
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }
      
      // Set other properties
      utterance.rate = 1.0; // Speech rate (0.1 to 10)
      utterance.pitch = 1.0; // Pitch (0 to 2)
      
      // Speak the text
      window.speechSynthesis.speak(utterance);
    } else {
      console.warn('Browser does not support speech synthesis');
    }
  };

  // Scroll to bottom of messages when new message is added
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Effect for TTS when AI message arrives and finishes streaming
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    // Check if loading is finished and the last message is from AI
    if (!isLoading && lastMessage?.sender === 'ai') {
        // We might want to add a small delay or check if the message hasn't been spoken yet
        // This simple version speaks every time a final AI message is set
        speakText(lastMessage.text);
    }
    // Depend on isLoading to trigger TTS *after* the response is fully received
  }, [messages, isLoading, ttsEnabled]);


  return (
    <div className="flex flex-col h-screen bg-gray-100 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow p-4 flex justify-between items-center">
        <h1 className="text-xl font-semibold text-gray-800 dark:text-white">Local LLM Chat</h1>
        <div className="flex items-center space-x-4">
          {/* Settings button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            aria-label="Open settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </button>
          
          {/* Model display */}
          <div className="hidden sm:flex items-center space-x-2 px-3 py-1 bg-gray-200 dark:bg-gray-700 rounded-full text-sm">
            <span className="text-gray-500 dark:text-gray-400">Model:</span>
            <span className="text-gray-800 dark:text-white font-medium">{currentModel}</span>
          </div>
          
          {/* TTS toggle */}
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">TTS:</span>
            <button
              onClick={() => setTtsEnabled(!ttsEnabled)}
              className={`px-3 py-1 rounded-md text-sm ${
                ttsEnabled
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300'
              }`}
            >
              {ttsEnabled ? 'On' : 'Off'}
            </button>
          </div>
        </div>
      </header>

      {/* Chat Messages */}
      <main className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex ${
              msg.sender === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`p-3 rounded-lg max-w-lg break-words ${ // Added break-words
                msg.sender === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-white'
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {isLoading && messages[messages.length - 1]?.sender === 'user' && (
            <div className="flex justify-start">
                <div className="p-3 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 animate-pulse">
                    Thinking...
                </div>
            </div>
        ) /* Show thinking indicator */}
        <div ref={messagesEndRef} /> {/* Element to scroll to */}
      </main>

      {/* Input Area */}
      <footer className="bg-white dark:bg-gray-800 shadow p-4">
        <div className="flex items-center space-x-2">
          <button
            onClick={handleVoiceInput}
            disabled={isLoading} // Disable mic while loading
            className={`p-2 rounded-full ${isListening ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'} transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
            aria-label={isListening ? 'Stop listening' : 'Start voice input'}
          >
            {/* Basic Mic Icon Placeholder */}
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15a3 3 0 0 1-3-3V4.5a3 3 0 0 1 6 0V12a3 3 0 0 1-3 3Z" />
            </svg>
          </button>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder={isLoading ? "Waiting for AI..." : "Type your message..."}
            disabled={isLoading} // Disable input while loading
            className="flex-1 p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={sendMessage}
            disabled={isLoading} // Disable send while loading
            className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </footer>
      
      {/* Settings Modal */}
      <Settings 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        currentModel={currentModel}
        onModelChange={handleModelChange}
      />
    </div>
  );
}
