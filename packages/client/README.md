# ElevenLabs Streaming Client

A high-performance TypeScript client for ElevenLabs text-to-speech with buffered audio streaming. No more glitchy playback - just smooth, butter-like audio!

## Features

- ✅ Full audio buffering before playback
- ✅ Smooth streaming with no glitches
- ✅ TypeScript support
- ✅ Easy integration
- ✅ Built-in ffplay audio playback
- ✅ Voice listing support

## Installation

```bash
npm install elevenlabs-streaming-client
```

## Usage

```typescript
import { ElevenLabsStreamingClient } from 'elevenlabs-streaming-client';

// Initialize the client
const client = new ElevenLabsStreamingClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
  defaultVoiceId: 'Au8OOcCmvsCaQpmULvvQ', // Optional
  defaultModelId: 'eleven_flash_v2', // Optional
  voiceSettings: {
    stability: 0.5,
    similarityBoost: 0.75,
    style: 0.1,
  },
});

// Generate and play audio
const audioBuffer = await client.generateAudio({
  text: 'Hello, world! This audio is smooth as butter!',
  playAudio: true, // Set to false to just get the buffer
});

// List available voices
const voices = await client.listVoices();
console.log(voices);
```

## API

### `new ElevenLabsStreamingClient(config)`

- `config.apiKey` (required): Your ElevenLabs API key
- `config.defaultVoiceId`: Default voice ID to use
- `config.defaultModelId`: Default model ID (default: "eleven_flash_v2")
- `config.voiceSettings`: Voice settings object
  - `stability`: 0-1 (default: 0.5)
  - `similarityBoost`: 0-1 (default: 0.75)
  - `style`: 0-1 (default: 0.1)

### `client.generateAudio(options)`

- `options.text` (required): Text to convert to speech
- `options.voiceId`: Override default voice ID
- `options.modelId`: Override default model ID
- `options.playAudio`: Whether to play audio (default: true)

Returns: `Promise<Buffer>` - The audio buffer

### `client.listVoices()`

Returns: `Promise<Voice[]>` - Array of available voices

### `client.playAudio(audioBuffer)`

- `audioBuffer`: Buffer containing MP3 audio data

Returns: `Promise<void>` - Resolves when playback completes

## Requirements

- Node.js 18+
- ffplay (comes with ffmpeg) for audio playback

## License

MIT

Built by Rusty Butter for MAXIMUM STREAMING AUTONOMY! 🚀
