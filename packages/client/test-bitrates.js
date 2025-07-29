#!/usr/bin/env node
const { ElevenLabsStreamingClient } = require('./dist/index.js');

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) {
  console.error('Please set ELEVENLABS_API_KEY environment variable');
  process.exit(1);
}

const bitrates = [
  { format: 'mp3_22050_32', description: 'Lowest quality - 22kHz, 32kbps' },
  { format: 'mp3_44100_32', description: 'Low quality - 44.1kHz, 32kbps' },
  { format: 'mp3_44100_64', description: 'Medium quality - 44.1kHz, 64kbps (new default)' },
  { format: 'mp3_44100_96', description: 'Good quality - 44.1kHz, 96kbps' },
  { format: 'mp3_44100_128', description: 'High quality - 44.1kHz, 128kbps (old default)' },
  {
    format: 'mp3_44100_192',
    description: 'Premium quality - 44.1kHz, 192kbps (requires Creator tier)',
  },
];

async function testBitrate(format, description) {
  console.log(`\n\n=== Testing ${description} ===`);
  console.log(`Format: ${format}`);

  const client = new ElevenLabsStreamingClient({
    apiKey: API_KEY,
    defaultOutputFormat: format,
  });

  const text =
    'Hello stream! This is a test of different audio bitrates to find the best balance between quality and streaming performance.';

  console.time(`Generation time for ${format}`);

  try {
    const audioBuffer = await client.generateAudio({
      text,
      playAudio: true,
    });

    console.timeEnd(`Generation time for ${format}`);
    console.log(`Audio size: ${(audioBuffer.length / 1024).toFixed(2)} KB`);
    console.log(
      `Bitrate efficiency: ${(audioBuffer.length / text.length).toFixed(2)} bytes per character`
    );

    // Wait a bit between tests
    await new Promise((resolve) => setTimeout(resolve, 3000));
  } catch (error) {
    console.error(`Error testing ${format}:`, error.message);
  }
}

async function main() {
  console.log('ElevenLabs Bitrate Testing Tool');
  console.log('================================');
  console.log('Testing different bitrates to find optimal settings for streaming...\n');

  for (const { format, description } of bitrates) {
    await testBitrate(format, description);
  }

  console.log('\n\n=== Summary ===');
  console.log('Lower bitrates (32-64 kbps) provide:');
  console.log('- Faster generation and streaming');
  console.log('- Less buffering and glitching');
  console.log('- Smaller file sizes');
  console.log('- Acceptable quality for voice streaming');
  console.log('\nRecommended: mp3_44100_64 for best balance');
}

main().catch(console.error);
