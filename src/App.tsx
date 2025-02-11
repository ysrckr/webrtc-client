import './App.css';

import { useEffect, useRef, useState } from 'react';

function App() {
  const socket = new WebSocket('wss://127.0.0.1:8000/api/v1/peer');
  const [params, setParams] = useState<{
    video: MediaStreamTrack | null;
    audio: MediaStreamTrack | null;
  }>({ video: null, audio: null });
  const webcamVideo = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const getLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          width: {
            min: 640,
            max: 1920,
          },
          height: {
            min: 400,
            max: 1080,
          },
        },
      });

      setStream(stream);

      const tracks = stream.getTracks();
      setParams(prev => {
        return {
          ...prev,
          video: tracks.find(track => track.kind === 'video') || null,
          audio: tracks.find(track => track.kind === 'audio') || null,
        };
      });
      if (webcamVideo.current) {
        webcamVideo.current.srcObject = stream;
      }
    } catch (error) {
      if (error instanceof Error) {
        console.error(error.message);
      }
    }
  };

  const stopStream = (stream: MediaStream) => {
    stream.getTracks().forEach(track => track.stop());
  };

  console.log(params);

  useEffect(() => {
    socket.onopen = () => {
      console.info('`connection Open');
      socket.send(JSON.stringify({ message: 'hello' }));
    };

    socket.onerror = error => {
      console.error(error);
    };

    socket.onmessage = event => {
      console.info(event.data);
    };

    return () => {
      if (socket.readyState === 1) {
        socket.close();
      }
    };
  });

  return (
    <main>
      <div>
        <video ref={webcamVideo} autoPlay playsInline></video>
        <button type="button" onClick={getLocalStream}>
          Open Camera and Mic
        </button>
        <button
          type="button"
          onClick={() => {
            if (stream) {
              stopStream(stream);
            }
          }}
        >
          Stop
        </button>
      </div>
    </main>
  );
}

export default App;
