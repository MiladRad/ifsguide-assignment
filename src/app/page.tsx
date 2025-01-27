"use client"
import React, { useState, useRef } from 'react';
import { Button } from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';

const ChatPage: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<string | null>(null);
  const [responseAudioUrl, setResponseAudioUrl] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        chunks.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunks.current, { type: "audio/webm" });
        chunks.current = [];
        setAudioUrl(URL.createObjectURL(audioBlob));
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (error) {
      console.error("Error accessing microphone:", error);
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const handleGetResponse = async () => {
    if (!audioUrl) return;

    try {
      // Step 1: Convert voice to text
      const transcriptionText = await convertVoiceToText(audioUrl);
      setTranscription(transcriptionText);

      // Step 2: Establish WebSocket connection and send text
      const chatResponse = await interactWithChatGPT(transcriptionText);

    } catch (error) {
      console.error("Error handling response:", error);
    }
  };

  const convertVoiceToText = async (audioUrl: string): Promise<string> => {
    // Upload audio to OpenAI's API and get transcription
    const audioBlob = await fetch(audioUrl).then((res) => res.blob());
    const formData = new FormData();
    formData.append("file", audioBlob, "audio.webm");
    formData.append("model", "whisper-1");

    const response = await fetch(`${process.env.openaiUrl}/audio/transcriptions`, {
      method: "POST",
      body: formData,
      headers: { "Authorization": `Bearer ${process.env.openaiApiKey}` }
    });

    const data = await response.json();
    return data.text;
  };

  const interactWithChatGPT = async (text: string): Promise<string> => {

    const ws = new WebSocket(
      "wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17",
      [
        "realtime",
        // Auth
        "openai-insecure-api-key." + process.env.openaiApiKey,
        // Optional
        "openai-organization." + process.env.openaiOrgId,
        "openai-project." + process.env.openaiProjectKey,
        // Beta protocol, required
        "openai-beta.realtime-v1"
      ]
    );

    return new Promise((resolve, reject) => {
      ws.onopen = () => {
        console.log(text);
        const event = {
          type: "response.create",
          response: {
            modalities: ["text"],
            instructions: text,
          }
        };
        ws.send(JSON.stringify(event));
      };

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        resolve(data.content);
        ws.close();
      };

      ws.onerror = (error) => {
        reject(error);
      };
    });
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Voice Recorder Chat</h1>
      <Card className="mb-4">
        <CardContent>
          <div className="flex justify-between items-center">
            <Button
              onClick={isRecording ? stopRecording : startRecording}
              className="px-4 py-2 text-white bg-blue-500 hover:bg-blue-600"
            >
              {isRecording ? "Stop Recording" : "Start Recording"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {audioUrl && (
        <Card className="mb-4">
          <CardContent>
            <h2 className="text-lg font-semibold mb-2">Playback</h2>
            <audio controls src={audioUrl} className="w-full" />
          </CardContent>
        </Card>
      )}

      {audioUrl && !transcription && (
        <Button
          onClick={handleGetResponse}
          className="px-4 py-2 text-white bg-green-500 hover:bg-green-600"
        >
          Get Response
        </Button>
      )}

      {transcription && (
        <Card className="mb-4">
          <CardContent>
            <h2 className="text-lg font-semibold">Transcription</h2>
            <p>{transcription}</p>
          </CardContent>
        </Card>
      )}

    </div>
  );
};
export default ChatPage;
