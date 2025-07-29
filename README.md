# ElevenLabs Streaming

A mono-repo for ElevenLabs streaming audio functionality, containing:

- **Client**: WebSocket client for streaming audio from ElevenLabs
- **MCP Server**: Model Context Protocol server for LLM integration

## Packages

### Client (`packages/client`)
WebSocket client that connects to ElevenLabs for real-time text-to-speech streaming.

### MCP Server (`packages/mcp-server`)
MCP server that provides LLM-friendly interface for controlling ElevenLabs streaming.

## Development

```bash
# Install dependencies
npm install

# Run all services in development mode
npm run dev

# Build all packages
npm run build
```

## License

MIT