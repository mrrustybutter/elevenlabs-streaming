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
export declare class ElevenLabsStreamingClient {
  private client;
  private config;
  constructor(config: ElevenLabsStreamingClientConfig);
  generateAudio(options: GenerateAudioOptions): Promise<Buffer>;
  playAudio(audioBuffer: Buffer): Promise<void>;
  listVoices(): Promise<
    {
      id: any;
      name: any;
      category: any;
      description: any;
    }[]
  >;
}
//# sourceMappingURL=index.d.ts.map
