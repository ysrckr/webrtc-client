import './App.css';

import { useEffect, useRef, useState } from 'react';

import { Device } from 'mediasoup-client';
import { Manager } from 'socket.io-client';
import { RtpCapabilities } from 'mediasoup-client/lib/RtpParameters';
import { SocketIO } from './enums/socket';

export type MediaKind = 'audio' | 'video';

export type RtcpFeedback = {
  /**
   * RTCP feedback type.
   */
  type: string;
  /**
   * RTCP feedback parameter.
   */
  parameter?: string;
};

export type RtpCodecCapability = {
  /**
   * Media kind.
   */
  kind: MediaKind;
  /**
   * The codec MIME media type/subtype (e.g. 'audio/opus', 'video/VP8').
   */
  mimeType: string;
  /**
   * The preferred RTP payload type.
   */
  preferredPayloadType?: number;
  /**
   * Codec clock rate expressed in Hertz.
   */
  clockRate: number;
  /**
   * The number of channels supported (e.g. two for stereo). Just for audio.
   * Default 1.
   */
  channels?: number;
  /**
   * Codec specific parameters. Some parameters (such as 'packetization-mode'
   * and 'profile-level-id' in H264 or 'profile-id' in VP9) are critical for
   * codec matching.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parameters?: any;
  /**
   * Transport layer and codec-specific feedback messages for this codec.
   */
  rtcpFeedback?: RtcpFeedback[];
};

function App() {
  const [, setParams] = useState<{
    video: MediaStreamTrack | null;
    audio: MediaStreamTrack | null;
  }>({ video: null, audio: null });
  const webcamVideo = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  let device;
  let rtpCapabilities: RtpCapabilities;
  // let producerTransport;
  // let consumerTransport;
  // let producer;
  // let consumer;

  const manager = new Manager('ws://localhost:8000', {
    reconnectionDelayMax: 10000,
  });

  const socket = manager.socket('/peers');

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

  const createDevice = async () => {
    try {
      device = new Device();

      await device.load({
        routerRtpCapabilities: rtpCapabilities,
      });

      console.log('RTP Capabilities', device.rtpCapabilities);
    } catch (error) {
      console.log(error);
      if (error instanceof Error)
        if (error.name === 'UnsupportedError')
          console.warn('browser not supported');
    }
  };

  const getRtpCapabilities = () => {
    socket.emit(
      SocketIO.RTPCapabilities,
      (data: { rtpCapabilities: RtpCapabilities }) => {
        console.log(`Router RTP Capabilities... ${data.rtpCapabilities}`);

        rtpCapabilities = data.rtpCapabilities;
      },
    );
  };

  useEffect(() => {
    socket.on(SocketIO.ConnectionSuccess, () => {
      getRtpCapabilities();
      createDevice();
    });

    return () => {};
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
