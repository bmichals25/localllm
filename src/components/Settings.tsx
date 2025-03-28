'use client';

import * as React from 'react';
import { useState, useEffect } from 'react';

interface SettingsProps {
  isOpen: boolean;
  onClose: () => void;
  currentModel: string;
  onModelChange: (model: string) => void;
}

interface ModelInfo {
  name: string;
  id: string;
  size: string;
  modified: string;
}

export function Settings({ isOpen, onClose, currentModel, onModelChange }: SettingsProps) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchModels();
    }
  }, [isOpen]);

  const fetchModels = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await fetch('http://localhost:11434/api/tags');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setModels(data.models || []);
    } catch (err) {
      console.error('Error fetching models:', err);
      setError('Failed to fetch available models. Make sure Ollama is running.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg w-full max-w-md p-6 shadow-xl">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-gray-800 dark:text-white">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mb-6">
          <h3 className="text-md font-semibold mb-2 text-gray-700 dark:text-gray-300">Select Model</h3>
          
          {isLoading ? (
            <div className="py-4 text-center text-gray-600 dark:text-gray-400">
              Loading models...
            </div>
          ) : error ? (
            <div className="py-4 text-center text-red-500">
              {error}
              <button 
                onClick={fetchModels}
                className="block mx-auto mt-2 text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Try Again
              </button>
            </div>
          ) : models.length === 0 ? (
            <div className="py-4 text-center text-gray-600 dark:text-gray-400">
              No models found. Pull models in Ollama first.
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto">
              <ul className="space-y-2">
                {models.map((model) => (
                  <li key={model.id}>
                    <label className="flex items-center space-x-3 cursor-pointer p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                      <input
                        type="radio"
                        name="model"
                        value={model.name}
                        checked={currentModel === model.name}
                        onChange={() => onModelChange(model.name)}
                        className="form-radio h-4 w-4 text-blue-500"
                      />
                      <div>
                        <div className="text-gray-800 dark:text-gray-200 font-medium">{model.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {model.size} • Modified: {model.modified}
                        </div>
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
} 