#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { ElevenLabsStreamingClient } from '@elevenlabs-streaming/client';

// Configuration from environment variables
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'Au8OOcCmvsCaQpmULvvQ';
const DEFAULT_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || 'eleven_flash_v2';
const DEFAULT_OUTPUT_FORMAT = process.env.ELEVENLABS_OUTPUT_FORMAT || 'mp3_44100_64';
const DEFAULT_STABILITY = parseFloat(process.env.ELEVENLABS_STABILITY || '0.5');
const DEFAULT_SIMILARITY_BOOST = parseFloat(process.env.ELEVENLABS_SIMILARITY_BOOST || '0.75');
const DEFAULT_STYLE = parseFloat(process.env.ELEVENLABS_STYLE || '0.1');

interface TextToSpeechParams {
  text: string;
  voice_id?: string;
  model_id?: string;
  output_format?: string;
  play_audio?: boolean;
  max_chunk_length?: number;
  chunk_by_sentences?: boolean;
}

// Text chunking utilities for optimal audio streaming
class TextChunker {
  /**
   * Estimates audio duration based on text length and speech rate
   * Average speech rate: ~150-160 words per minute = ~2.5 words per second
   * @param text Text to analyze
   * @returns Estimated duration in seconds
   */
  static estimateAudioDuration(text: string): number {
    const wordCount = text.trim().split(/\s+/).length;
    const wordsPerSecond = 2.5; // Conservative estimate
    return wordCount / wordsPerSecond;
  }

  /**
   * Splits text into chunks that will produce audio under target duration
   * @param text Original text
   * @param maxDurationSeconds Target max duration per chunk (default: 10 seconds)
   * @param chunkBySentences Whether to respect sentence boundaries
   * @returns Array of text chunks
   */
  static chunkText(text: string, maxDurationSeconds: number = 10, chunkBySentences: boolean = true): string[] {
    if (this.estimateAudioDuration(text) <= maxDurationSeconds) {
      return [text];
    }

    const maxWordsPerChunk = Math.floor(maxDurationSeconds * 2.5); // Conservative estimate
    
    if (chunkBySentences) {
      return this.chunkBySentences(text, maxWordsPerChunk);
    } else {
      return this.chunkByWords(text, maxWordsPerChunk);
    }
  }

  private static chunkBySentences(text: string, maxWordsPerChunk: number): string[] {
    // Split by sentences (periods, exclamation marks, question marks)
    const sentences = text.match(/[^\.!?]+[\.!?]+/g) || [text];
    const chunks: string[] = [];
    let currentChunk = '';
    let currentWordCount = 0;

    for (const sentence of sentences) {
      const sentenceWords = sentence.trim().split(/\s+/).length;
      
      // If adding this sentence would exceed the limit, start a new chunk
      if (currentWordCount + sentenceWords > maxWordsPerChunk && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
        currentWordCount = sentenceWords;
      } else {
        currentChunk += (currentChunk ? ' ' : '') + sentence;
        currentWordCount += sentenceWords;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks.filter(chunk => chunk.length > 0);
  }

  private static chunkByWords(text: string, maxWordsPerChunk: number): string[] {
    const words = text.trim().split(/\s+/);
    const chunks: string[] = [];
    
    for (let i = 0; i < words.length; i += maxWordsPerChunk) {
      const chunk = words.slice(i, i + maxWordsPerChunk).join(' ');
      chunks.push(chunk);
    }
    
    return chunks;
  }
}

class ElevenLabsStreamingMCPServer {
  private server: Server;
  private client: ElevenLabsStreamingClient;
  private cachedVoices: any[] | null = null;
  private voiceCacheExpiry: number = 0;

  constructor() {
    if (!ELEVENLABS_API_KEY) {
      console.error('ERROR: ELEVENLABS_API_KEY environment variable not set!');
      console.error('Please set it in your environment or MCP configuration.');
      process.exit(1);
    }

    // Initialize the streaming client
    this.client = new ElevenLabsStreamingClient({
      apiKey: ELEVENLABS_API_KEY,
      defaultVoiceId: DEFAULT_VOICE_ID,
      defaultModelId: DEFAULT_MODEL_ID,
      defaultOutputFormat: DEFAULT_OUTPUT_FORMAT,
      voiceSettings: {
        stability: DEFAULT_STABILITY,
        similarityBoost: DEFAULT_SIMILARITY_BOOST,
        style: DEFAULT_STYLE,
      },
    });

    this.server = new Server(
      {
        name: 'elevenlabs-streaming-mcp',
        version: '1.3.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'generate_audio',
          description: 'Generate and stream audio from text using ElevenLabs',
          inputSchema: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: 'Text to convert to speech',
              },
              voice_id: {
                type: 'string',
                description: `Voice ID to use (default: ${DEFAULT_VOICE_ID})`,
              },
              model_id: {
                type: 'string',
                description: `Model ID to use (default: ${DEFAULT_MODEL_ID})`,
              },
              output_format: {
                type: 'string',
                description: `Output format (default: ${DEFAULT_OUTPUT_FORMAT}). Options: mp3_22050_32, mp3_44100_32, mp3_44100_64, mp3_44100_96, mp3_44100_128, mp3_44100_192`,
              },
              play_audio: {
                type: 'boolean',
                description: 'Whether to play the audio (default: true)',
              },
              max_chunk_length: {
                type: 'number',
                description: 'Maximum duration in seconds per audio chunk (default: 10). Helps prevent ffplay glitches.',
                minimum: 1,
                maximum: 60,
              },
              chunk_by_sentences: {
                type: 'boolean',
                description: 'Whether to split text at sentence boundaries for better natural flow (default: true)',
              },
            },
            required: ['text'],
          },
        },
        {
          name: 'list_voices',
          description: 'List available ElevenLabs voices',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'analyze_text',
          description: 'Analyze text for audio duration estimation and chunking preview',
          inputSchema: {
            type: 'object',
            properties: {
              text: {
                type: 'string',
                description: 'Text to analyze',
              },
              max_chunk_length: {
                type: 'number',
                description: 'Maximum duration in seconds per chunk for analysis (default: 10)',
                minimum: 1,
                maximum: 60,
              },
              chunk_by_sentences: {
                type: 'boolean',
                description: 'Whether to split at sentence boundaries (default: true)',
              },
            },
            required: ['text'],
          },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'generate_audio':
          return await this.generateAudio(
            request.params.arguments as unknown as TextToSpeechParams
          );
        case 'list_voices':
          return await this.listVoices();
        case 'analyze_text':
          return await this.analyzeText(
            request.params.arguments as unknown as {
              text: string;
              max_chunk_length?: number;
              chunk_by_sentences?: boolean;
            }
          );
        default:
          throw new Error(`Unknown tool: ${request.params.name}`);
      }
    });
  }

  private async generateAudio(params: TextToSpeechParams) {
    const {
      text,
      voice_id = DEFAULT_VOICE_ID,
      model_id = DEFAULT_MODEL_ID,
      output_format = DEFAULT_OUTPUT_FORMAT,
      play_audio = true,
      max_chunk_length = 10,
      chunk_by_sentences = true,
    } = params;

    try {
      // Validate voice ID if not using default
      if (voice_id !== DEFAULT_VOICE_ID) {
        const isValidVoice = await this.validateVoiceId(voice_id);
        if (!isValidVoice) {
          throw new Error(`Invalid voice ID: ${voice_id}. Use 'list_voices' tool to see available voices.`);
        }
      }

      // Estimate total audio duration
      const estimatedDuration = TextChunker.estimateAudioDuration(text);
      console.error(`[ElevenLabs MCP] Text analysis: ${text.length} chars, ~${estimatedDuration.toFixed(1)}s audio`);

      // Check if text needs chunking
      const chunks = TextChunker.chunkText(text, max_chunk_length, chunk_by_sentences);
      
      if (chunks.length > 1) {
        console.error(`[ElevenLabs MCP] Text split into ${chunks.length} chunks for optimal streaming`);
        return await this.generateChunkedAudio(chunks, {
          voice_id,
          model_id,
          output_format,
          play_audio,
        });
      }

      console.error(`[ElevenLabs MCP] Generating single audio chunk: "${text.substring(0, 50)}..."`);

      // Use the client to generate audio with streaming
      const audioBuffer = await this.client.generateAudio({
        text,
        voiceId: voice_id,
        modelId: model_id,
        outputFormat: output_format,
        playAudio: play_audio,
      });

      return {
        content: [
          {
            type: 'text',
            text: `Audio generated and ${play_audio ? 'streamed' : 'buffered'} successfully! (${audioBuffer.length} bytes, ~${estimatedDuration.toFixed(1)}s)`,
          },
        ],
      };
    } catch (error) {
      console.error('[ElevenLabs MCP] Error generating audio:', error);
      throw new Error(`Audio generation failed: ${error}`);
    }
  }

  private async generateChunkedAudio(
    chunks: string[],
    options: {
      voice_id: string;
      model_id: string;
      output_format: string;
      play_audio: boolean;
    }
  ) {
    let totalBytes = 0;
    let totalDuration = 0;
    const errors: string[] = [];

    console.error(`[ElevenLabs MCP] Processing ${chunks.length} audio chunks sequentially...`);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const chunkDuration = TextChunker.estimateAudioDuration(chunk);
      totalDuration += chunkDuration;

      try {
        console.error(`[ElevenLabs MCP] Chunk ${i + 1}/${chunks.length}: "${chunk.substring(0, 30)}..." (~${chunkDuration.toFixed(1)}s)`);
        
        const audioBuffer = await this.client.generateAudio({
          text: chunk,
          voiceId: options.voice_id,
          modelId: options.model_id,
          outputFormat: options.output_format,
          playAudio: options.play_audio,
        });

        totalBytes += audioBuffer.length;
        console.error(`[ElevenLabs MCP] Chunk ${i + 1} completed: ${audioBuffer.length} bytes`);

        // Small delay between chunks to prevent overwhelming the API
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (chunkError) {
        const errorMsg = `Chunk ${i + 1} failed: ${chunkError}`;
        console.error(`[ElevenLabs MCP] ${errorMsg}`);
        errors.push(errorMsg);
        
        // Continue with remaining chunks unless there are too many failures
        if (errors.length > chunks.length / 2) {
          throw new Error(`Too many chunk failures: ${errors.join(', ')}`);
        }
      }
    }

    const successfulChunks = chunks.length - errors.length;
    let resultText = `Chunked audio generation completed! ${successfulChunks}/${chunks.length} chunks successful (${totalBytes} bytes, ~${totalDuration.toFixed(1)}s total)`;
    
    if (errors.length > 0) {
      resultText += `\n\nWarnings: ${errors.join('; ')}`;
    }

    return {
      content: [
        {
          type: 'text',
          text: resultText,
        },
      ],
    };
  }

  private async analyzeText(params: {
    text: string;
    max_chunk_length?: number;
    chunk_by_sentences?: boolean;
  }) {
    const {
      text,
      max_chunk_length = 10,
      chunk_by_sentences = true,
    } = params;

    try {
      // Basic text analysis
      const charCount = text.length;
      const wordCount = text.trim().split(/\s+/).length;
      const sentenceCount = (text.match(/[.!?]+/g) || []).length;
      const estimatedDuration = TextChunker.estimateAudioDuration(text);

      // Generate chunks for preview
      const chunks = TextChunker.chunkText(text, max_chunk_length, chunk_by_sentences);
      
      // Analyze chunks
      const chunkAnalysis = chunks.map((chunk, index) => ({
        index: index + 1,
        text: chunk.substring(0, 50) + (chunk.length > 50 ? '...' : ''),
        characters: chunk.length,
        words: chunk.trim().split(/\s+/).length,
        estimatedSeconds: TextChunker.estimateAudioDuration(chunk),
      }));

      const analysis = {
        textAnalysis: {
          characters: charCount,
          words: wordCount,
          sentences: sentenceCount,
          estimatedAudioDuration: `${estimatedDuration.toFixed(1)} seconds`,
        },
        chunkingPreview: {
          totalChunks: chunks.length,
          chunkingMethod: chunk_by_sentences ? 'sentences' : 'words',
          maxChunkDuration: `${max_chunk_length} seconds`,
          chunks: chunkAnalysis,
        },
        recommendations: this.getTextRecommendations(estimatedDuration, chunks.length, charCount),
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(analysis, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Text analysis failed: ${error}`);
    }
  }

  private getTextRecommendations(duration: number, chunkCount: number, charCount: number): string[] {
    const recommendations: string[] = [];

    if (duration > 60) {
      recommendations.push('⚠️  Very long text (>60s). Consider splitting or summarizing for better user experience.');
    } else if (duration > 30) {
      recommendations.push('⚠️  Long text (>30s). Chunking is recommended to prevent ffplay glitches.');
    }

    if (chunkCount > 10) {
      recommendations.push('📝 Many chunks detected. Consider increasing max_chunk_length or summarizing content.');
    }

    if (charCount > 5000) {
      recommendations.push('📏 Very long text. ElevenLabs API may take longer to process.');
    }

    if (duration <= 10 && chunkCount === 1) {
      recommendations.push('✅ Optimal length for streaming audio.');
    }

    if (recommendations.length === 0) {
      recommendations.push('✅ Text length is good for audio generation.');
    }

    return recommendations;
  }

  private async validateVoiceId(voiceId: string): Promise<boolean> {
    try {
      // Cache voices for 5 minutes to avoid excessive API calls
      const now = Date.now();
      if (!this.cachedVoices || now > this.voiceCacheExpiry) {
        console.error('[ElevenLabs MCP] Refreshing voice cache...');
        this.cachedVoices = await this.client.listVoices();
        this.voiceCacheExpiry = now + 5 * 60 * 1000; // 5 minutes
      }

      const voice = this.cachedVoices.find(v => v.id === voiceId);
      if (!voice) {
        console.error(`[ElevenLabs MCP] Invalid voice ID: ${voiceId}`);
        const availableVoices = this.cachedVoices.slice(0, 5).map(v => `${v.name} (${v.id})`).join(', ');
        console.error(`[ElevenLabs MCP] Available voices: ${availableVoices}...`);
        return false;
      }

      console.error(`[ElevenLabs MCP] Voice validated: ${voice.name} (${voice.id})`);
      return true;
    } catch (error) {
      console.error('[ElevenLabs MCP] Voice validation failed, proceeding anyway:', error);
      return true; // Fail open - if we can't validate, let the API handle it
    }
  }

  private async listVoices() {
    try {
      // Use cached voices if available and fresh
      const now = Date.now();
      if (this.cachedVoices && now <= this.voiceCacheExpiry) {
        console.error('[ElevenLabs MCP] Using cached voice list');
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(this.cachedVoices, null, 2),
            },
          ],
        };
      }

      // Fetch fresh voice list
      console.error('[ElevenLabs MCP] Fetching fresh voice list from API');
      const voices = await this.client.listVoices();
      
      // Update cache
      this.cachedVoices = voices;
      this.voiceCacheExpiry = now + 5 * 60 * 1000; // 5 minutes

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(voices, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to list voices: ${error}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[ElevenLabs MCP] Streaming Server v1.3.0 running with intelligent text chunking...');
    console.error(`[ElevenLabs MCP] Voice ID: ${DEFAULT_VOICE_ID}`);
    console.error(`[ElevenLabs MCP] Model ID: ${DEFAULT_MODEL_ID}`);
    console.error(`[ElevenLabs MCP] Output Format: ${DEFAULT_OUTPUT_FORMAT}`);
    console.error('[ElevenLabs MCP] Using buffered audio playback for smooth streaming!');
  }
}

const server = new ElevenLabsStreamingMCPServer();
server.run().catch(console.error);
