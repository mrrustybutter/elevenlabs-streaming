import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { spawn } from 'child_process';
import { Readable, PassThrough } from 'stream';
import { pipeline } from 'stream/promises';

export interface ElevenLabsStreamingClientConfig {
  apiKey: string;
  defaultVoiceId?: string;
  defaultModelId?: string;
  defaultOutputFormat?: string;
  voiceSettings?: {
    stability?: number;
    similarityBoost?: number;
    style?: number;
  };
}

export interface GenerateAudioOptions {
  text: string;
  voiceId?: string;
  modelId?: string;
  outputFormat?: string;
  playAudio?: boolean;
}

export class ElevenLabsStreamingClient {
  private client: ElevenLabsClient;
  private config: Required<ElevenLabsStreamingClientConfig>;

  constructor(config: ElevenLabsStreamingClientConfig) {
    this.client = new ElevenLabsClient({
      apiKey: config.apiKey,
    });

    this.config = {
      apiKey: config.apiKey,
      defaultVoiceId: config.defaultVoiceId || 'Au8OOcCmvsCaQpmULvvQ',
      defaultModelId: config.defaultModelId || 'eleven_flash_v2',
      defaultOutputFormat: config.defaultOutputFormat || 'mp3_44100_64',
      voiceSettings: {
        stability: config.voiceSettings?.stability ?? 0.5,
        similarityBoost: config.voiceSettings?.similarityBoost ?? 0.75,
        style: config.voiceSettings?.style ?? 0.1,
      },
    };
  }

  async generateAudio(options: GenerateAudioOptions): Promise<Buffer> {
    const {
      text,
      voiceId = this.config.defaultVoiceId,
      modelId = this.config.defaultModelId,
      outputFormat = this.config.defaultOutputFormat,
      playAudio = true,
    } = options;

    console.warn(`[ElevenLabs Client] Generating audio for: "${text.substring(0, 50)}..."`);

    try {
      // Create audio stream
      const audioStream = await this.client.textToSpeech.convert(voiceId, {
        text,
        modelId,
        outputFormat: outputFormat as Parameters<
          typeof this.client.textToSpeech.convert
        >[1]['outputFormat'],
        voiceSettings: {
          stability: this.config.voiceSettings.stability,
          similarityBoost: this.config.voiceSettings.similarityBoost,
          style: this.config.voiceSettings.style,
        },
      });

      // Create a pass-through stream to collect chunks while streaming
      const passThrough = new PassThrough();
      const chunks: Buffer[] = [];
      
      // Collect chunks for return value
      passThrough.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      // Create readable stream from async iterator
      const nodeStream = Readable.from(audioStream);
      
      // Set up streaming playback if requested
      let playbackPromise: Promise<void> | null = null;
      if (playAudio) {
        playbackPromise = this.playStreamingAudio(passThrough);
      }

      // Pipe the audio stream through our pass-through
      try {
        await pipeline(nodeStream, passThrough);
      } catch (pipelineError) {
        console.error('[ElevenLabs Client] Pipeline error:', pipelineError);
        passThrough.destroy();
        throw pipelineError;
      }
      
      // Wait for playback to complete if it was started
      if (playbackPromise) {
        await playbackPromise;
      }

      const audioBuffer = Buffer.concat(chunks);
      console.warn(`[ElevenLabs Client] Generated ${audioBuffer.length} bytes of audio data`);

      return audioBuffer;
    } catch (error) {
      console.error('[ElevenLabs Client] Error generating audio:', error);
      throw error;
    }
  }

  async playStreamingAudio(audioStream: PassThrough): Promise<void> {
    return new Promise((resolve, reject) => {
      let ffplayProcess: any = null;
      let resolved = false;

      // Buffer management
      const bufferSize = 1024 * 512; // 512KB buffer
      const minBufferSize = 1024 * 128; // 128KB minimum before resuming
      let buffer: Buffer[] = [];
      let totalBuffered = 0;
      let isPaused = false;
      let isStreamEnded = false;
      let isWriting = false;

      const cleanup = () => {
        if (ffplayProcess && !ffplayProcess.killed) {
          ffplayProcess.kill('SIGTERM');
        }
      };

      try {
        ffplayProcess = spawn('ffplay', [
          '-f',
          'mp3',
          '-i',
          '-',
          '-nodisp',
          '-autoexit',
          '-loglevel',
          'error',  // Only show errors
          '-probesize',
          '32768',
          '-analyzeduration',
          '32768',
          '-sync',
          'audio',
          '-bufsize',
          '512k',  // Add buffer size
          '-infbuf',  // Use infinite buffer
          '-fflags',
          'nobuffer+flush_packets',  // Better streaming flags
          '-flags',
          'low_delay',
        ]);

        // Buffer writer function
        const writeToFfplay = () => {
          if (isWriting || !ffplayProcess || !ffplayProcess.stdin || ffplayProcess.stdin.destroyed) {
            return;
          }

          isWriting = true;

          while (buffer.length > 0 && !isPaused) {
            const chunk = buffer.shift()!;
            const couldWrite = ffplayProcess.stdin.write(chunk);
            totalBuffered -= chunk.length;

            if (!couldWrite) {
              // ffplay buffer is full, wait for drain
              ffplayProcess.stdin.once('drain', () => {
                isWriting = false;
                writeToFfplay();
              });
              return;
            }

            // Check if we need to pause due to low buffer
            if (totalBuffered < minBufferSize && !isStreamEnded && buffer.length < 10) {
              console.warn('[ElevenLabs Client] Buffer running low, pausing output...');
              isPaused = true;
            }
          }

          isWriting = false;

          // If stream ended and buffer is empty, close ffplay stdin
          if (isStreamEnded && buffer.length === 0 && ffplayProcess.stdin && !ffplayProcess.stdin.destroyed) {
            ffplayProcess.stdin.end();
          }
        };

        // Handle incoming audio data
        audioStream.on('data', (chunk: Buffer) => {
          buffer.push(chunk);
          totalBuffered += chunk.length;

          // Resume if we have enough buffer
          if (isPaused && totalBuffered >= bufferSize) {
            console.warn('[ElevenLabs Client] Buffer refilled, resuming output...');
            isPaused = false;
          }

          // Try to write if not paused
          if (!isPaused) {
            writeToFfplay();
          }
        });

        audioStream.on('end', () => {
          isStreamEnded = true;
          console.warn('[ElevenLabs Client] Stream ended, flushing remaining buffer...');
          isPaused = false; // Make sure we flush everything
          writeToFfplay();
        });

        // Handle stream errors
        audioStream.on('error', (error) => {
          console.error('[ElevenLabs Client] Audio stream error:', error);
          cleanup();
          if (!resolved) {
            resolved = true;
            reject(error);
          }
        });

        ffplayProcess.on('error', (error: any) => {
          console.error('[ElevenLabs Client] ffplay error:', error.message);
          if (!resolved) {
            resolved = true;
            reject(error);
          }
        });

        ffplayProcess.on('close', (code: number) => {
          if (!resolved) {
            resolved = true;
            if (code === 0 || code === null) {
              console.warn('[ElevenLabs Client] Audio playback completed');
              resolve();
            } else {
              reject(new Error(`ffplay exited with code ${code}`));
            }
          }
        });

        // Handle stdin errors
        ffplayProcess.stdin.on('error', (error: any) => {
          if (error.code !== 'EPIPE') {
            console.error('[ElevenLabs Client] ffplay stdin error:', error);
          }
        });

        // Start the writing process after initial buffer
        setTimeout(() => {
          if (totalBuffered > 0) {
            writeToFfplay();
          }
        }, 100);

      } catch (error) {
        console.error('[ElevenLabs Client] Failed to spawn ffplay:', error);
        if (!resolved) {
          resolved = true;
          reject(error);
        }
      }
    });
  }

  async playAudio(audioBuffer: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffplay = spawn('ffplay', [
        '-f',
        'mp3',
        '-i',
        '-',
        '-nodisp',
        '-autoexit',
        '-loglevel',
        'quiet',
        '-probesize',
        '32768',
        '-sync',
        'audio',
      ]);

      ffplay.stdin.write(audioBuffer);
      ffplay.stdin.end();

      ffplay.on('error', (error) => {
        console.error('[ElevenLabs Client] ffplay error:', error.message);
        reject(error);
      });

      ffplay.on('close', (code) => {
        if (code === 0) {
          console.warn('[ElevenLabs Client] Audio playback completed successfully');
          resolve();
        } else {
          reject(new Error(`ffplay exited with code ${code}`));
        }
      });
    });
  }

  async listVoices() {
    try {
      const voices = await this.client.voices.getAll();
      return voices.voices.map((voice) => ({
        id: voice.voiceId,
        name: voice.name,
        category: voice.category,
        description: voice.description,
      }));
    } catch (error) {
      console.error('[ElevenLabs Client] Error listing voices:', error);
      throw error;
    }
  }
}
