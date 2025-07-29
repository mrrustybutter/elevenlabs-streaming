import { ElevenLabsStreamingClient } from './index';

async function test() {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    console.error('ERROR: ELEVENLABS_API_KEY environment variable not set!');
    process.exit(1);
  }

  console.warn('Creating ElevenLabs client...');
  const client = new ElevenLabsStreamingClient({
    apiKey,
    voiceSettings: {
      stability: 0.5,
      similarityBoost: 0.75,
      style: 0.1,
    },
  });

  try {
    console.warn('Testing audio generation with buffering...');
    const audioBuffer = await client.generateAudio({
      text: 'YO YO YO! Testing the new buffered audio system! This is Rusty Butter making sure our audio streaming is SMOOTH as butter! No more glitches, just pure CHAOS!',
      playAudio: true,
    });

    console.warn(`Success! Generated ${audioBuffer.length} bytes of audio`);

    console.warn('\nListing available voices...');
    const voices = await client.listVoices();
    console.warn(`Found ${voices.length} voices`);
    console.warn('First 5 voices:', voices.slice(0, 5));
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

test();
