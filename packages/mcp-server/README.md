# ElevenLabs Streaming MCP Server

A high-performance MCP (Model Context Protocol) server for ElevenLabs text-to-speech with buffered streaming support! Built on top of `elevenlabs-streaming-client` for smooth, glitch-free audio playback.

## Features

- ✅ Buffered audio streaming - no more glitches!
- ✅ Built on elevenlabs-streaming-client
- ✅ Official ElevenLabs SDK integration
- ✅ True streaming - no file saving!
- ✅ Direct pipe to ffplay for smooth playback
- ✅ No token limit issues
- ✅ Environment-based configuration
- ✅ Voice listing support
- ✅ Works with npx - no installation needed!

## Quick Start

Add to your Claude Desktop config file:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%AppData%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "elevenlabs": {
      "command": "npx",
      "args": ["-y", "elevenlabs-streaming-mcp-server@latest"],
      "env": {
        "ELEVENLABS_API_KEY": "your_api_key_here",
        "ELEVENLABS_VOICE_ID": "Au8OOcCmvsCaQpmULvvQ",
        "ELEVENLABS_MODEL_ID": "eleven_flash_v2",
        "ELEVENLABS_STABILITY": "0.5",
        "ELEVENLABS_SIMILARITY_BOOST": "0.75",
        "ELEVENLABS_STYLE": "0.1"
      }
    }
  }
}
```

### Version Management

- **Always Latest**: The config uses `npx -y elevenlabs-streaming-mcp-server@latest` to always fetch the latest version
- **Specific Version**: Use `"args": ["-y", "elevenlabs-streaming-mcp-server@1.2.0"]` to pin a version
- **Default Behavior**: Without `@latest`, npx may use a cached version

## Environment Variables

- `ELEVENLABS_API_KEY` (required): Your ElevenLabs API key
- `ELEVENLABS_VOICE_ID`: Default voice ID (default: Rusty Butter's voice)
- `ELEVENLABS_MODEL_ID`: Model to use (default: eleven_flash_v2)
- `ELEVENLABS_STABILITY`: Voice stability 0-1 (default: 0.5)
- `ELEVENLABS_SIMILARITY_BOOST`: Voice similarity 0-1 (default: 0.75)
- `ELEVENLABS_STYLE`: Style exaggeration 0-1 (default: 0.1)

## Available Tools

### generate_audio

Generates audio from text with streaming support:

- `text` (required): Text to convert to speech
- `voice_id`: Override default voice
- `model_id`: Override default model
- `play_audio`: Whether to auto-play (default: true)

### list_voices

Lists all available ElevenLabs voices with their IDs and descriptions.

## Development

```bash
npm install
npm run dev   # Run with hot reload
npm run build # Build for production
```

## Publishing

```bash
npm publish
```

Built by Rusty Butter for MAXIMUM STREAMING AUTONOMY! 🚀
