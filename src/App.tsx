import './App.css';

import {
  AppData,
  Consumer,
  Producer,
  Transport,
} from 'mediasoup-client/lib/types';

import { Device } from 'mediasoup-client';
import { Manager } from 'socket.io-client';
import { RtpCapabilities } from 'mediasoup-client/lib/RtpParameters';
import { SocketIO } from './enums/socket';
import { useRef } from 'react';

function App() {
  const webcamVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const remoteAudio = useRef<HTMLAudioElement>(null);

  const device = new Device();
  let producerTransport: Transport<AppData>;
  let consumerTransport: Transport<AppData>;
  let videoProducer: Producer<AppData>;
  let audioProducer: Producer<AppData>;
  let consumer: Consumer<AppData>;
  let rtpCapabilities: RtpCapabilities;

  const manager = new Manager('ws://localhost:8000', {
    reconnectionDelayMax: 10000,
  });

  const socket = manager.socket(`/peers`);

  const params: any = {
    encodings: [
      {
        rid: 'r0',
        maxBitrate: 100000,
        scalabilityMode: 'S1T3',
      },
      {
        rid: 'r1',
        maxBitrate: 300000,
        scalabilityMode: 'S1T3',
      },
      {
        rid: 'r2',
        maxBitrate: 900000,
        scalabilityMode: 'S1T3',
      },
    ],
    codecOptions: {
      videoGoogleStartBitrate: 1000,
    },
  };
  let audioParams: any;
  let videoParams: any = { params };
  let stream: any;

  const getLocalStream = async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
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

      audioParams = { track: stream.getAudioTracks()[0], ...audioParams };
      videoParams = { track: stream.getVideoTracks()[0], ...videoParams };
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

  const createSendTransport = () => {
    socket.emit(
      SocketIO.CreateWebRtcTransport,
      { sender: true },
      ({ params: params }: { params: any }) => {
        if (params.error) {
          console.log(params.error);
          return;
        }

        producerTransport = device.createSendTransport(params);

        producerTransport.on(
          'connect',
          async ({ dtlsParameters }, callback, errback) => {
            try {
              await socket.emit(SocketIO.ConnectTransport, {
                dtlsParameters,
              });

              callback();
            } catch (error) {
              if (error instanceof Error) errback(error);
            }
          },
        );

        producerTransport.on(
          'produce',
          async (parameters, callback, errback) => {
            console.log(parameters);

            try {
              await socket.emit(
                SocketIO.TransportProduce,
                {
                  kind: parameters.kind,
                  rtpParameters: parameters.rtpParameters,
                  appData: parameters.appData,
                },
                ({ id }: { id: string }) => {
                  callback({ id });
                },
              );
            } catch (error) {
              if (error instanceof Error) errback(error);
            }
          },
        );
      },
    );
  };

  const connectSendTransport = async () => {
    try {
      audioProducer = await producerTransport.produce(audioParams);
      videoProducer = await producerTransport.produce(videoParams);
    } catch (error) {
      console.log(error);
    }

    videoProducer?.on('trackended', () => {
      console.log('video track ended');
      stopStream(stream);
    });

    videoProducer?.on('transportclose', () => {
      console.log('video transport ended');
      stopStream(stream);
    });

    audioProducer.on('trackended', () => {
      console.log('audio track ended');
      stopStream(stream);
    });

    audioProducer.on('transportclose', () => {
      console.log('audio transport ended');
      stopStream(stream);
    });
  };

  const createRecvTransport = async () => {
    await socket.emit(
      SocketIO.CreateWebRtcTransport,
      { sender: false },
      ({ params }: { params: any }) => {
        if (params.error) {
          console.error(params.error);
          return;
        }

        consumerTransport = device.createRecvTransport(params);

        consumerTransport?.on(
          'connect',
          async ({ dtlsParameters }, callback, errback) => {
            try {
              await socket.emit(SocketIO.TransportRCVConnect, {
                dtlsParameters,
              });

              callback();
            } catch (error) {
              if (error instanceof Error) errback(error);
            }
          },
        );
      },
    );
  };

  const connectRecvTransport = async () => {
    await socket.emit(
      SocketIO.Consume,
      {
        rtpCapabilities: device.rtpCapabilities,
      },
      async ({ params }: { params: any[] }) => {
        console.log(params);
        params?.forEach(async (param: any) => {
          if (param?.error) {
            console.log('Cannot Consume');
            return;
          }

          console.log(param);

          // then consume with the local consumer transport
          // which creates a consumer
          try {
            consumer = await consumerTransport.consume({
              id: param.id,
              producerId: param.producerId,
              kind: param.kind,
              rtpParameters: param.rtpParameters,
            });
          } catch (error) {
            console.log(error);
          }

          if (!consumer) {
            console.log('Consumer not created');
            return;
          }

          const videoMediaStream = new MediaStream();
          const audioMediaStream = new MediaStream();

          if (consumer.kind === 'video') {
            videoMediaStream.addTrack(consumer.track);
          } else {
            audioMediaStream.addTrack(consumer.track);
          }

          if (remoteVideo.current) {
            remoteVideo.current.srcObject = videoMediaStream;
          }

          if (remoteAudio.current) {
            remoteAudio.current.srcObject = audioMediaStream;
          }

          // the server consumer started with media paused
          // so we need to inform the server to resume
          socket.emit(SocketIO.ResumeConsumer);
        });
      },
    );
  };

  return (
    <main>
      <div>
        <video ref={webcamVideo} autoPlay playsInline></video>
        <button type="button" onClick={getLocalStream}>
          Open Camera and Mic
        </button>
        <button type="button" onClick={getRtpCapabilities}>
          RTP Capabilities
        </button>
        <button type="button" onClick={createDevice}>
          Create Device
        </button>
        <button type="button" onClick={createSendTransport}>
          createSendTransport
        </button>
        <button type="button" onClick={connectSendTransport}>
          connectSendTransport
        </button>
        <button type="button" onClick={createRecvTransport}>
          createRecvTransport
        </button>
        <button
          type="button"
          onClick={async () => await connectRecvTransport()}
        >
          connectRecvTransport
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
      <div>
        <video ref={remoteVideo} autoPlay playsInline></video>
        <audio ref={remoteAudio} autoPlay playsInline></audio>
      </div>
    </main>
  );
}

export default App;
