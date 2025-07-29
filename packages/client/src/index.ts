import { ElevenLabsClient } from 'elevenlabs';
import { spawn } from 'child_process';
import { Readable } from 'stream';

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

    console.log(`[ElevenLabs Client] Generating audio for: "${text.substring(0, 50)}..."`);

    try {
      // Create audio stream
      const audioStream = await this.client.textToSpeech.convert(voiceId, {
        text,
        model_id: modelId,
        output_format: outputFormat as any,
        voice_settings: {
          stability: this.config.voiceSettings.stability,
          similarity_boost: this.config.voiceSettings.similarityBoost,
          style: this.config.voiceSettings.style,
        },
      });

      // Buffer the audio stream
      const chunks: Buffer[] = [];
      const nodeStream = Readable.from(audioStream);

      for await (const chunk of nodeStream) {
        chunks.push(Buffer.from(chunk));
      }

      const audioBuffer = Buffer.concat(chunks);
      console.log(`[ElevenLabs Client] Buffered ${audioBuffer.length} bytes of audio data`);

      // Play audio if requested
      if (playAudio) {
        await this.playAudio(audioBuffer);
      }

      return audioBuffer;
    } catch (error) {
      console.error('[ElevenLabs Client] Error generating audio:', error);
      throw error;
    }
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
          console.log('[ElevenLabs Client] Audio playback completed successfully');
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
      return voices.voices.map((voice: any) => ({
        id: voice.voice_id,
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
