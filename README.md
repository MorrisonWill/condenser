# Condensed Audio Creator

## Description

This web application allows users to extract spoken dialogue from video files using subtitle information. It's designed to help language learners create condensed audio files containing only the spoken parts of TV shows or movies.

## Features

- Upload video files and corresponding subtitle files
- Extract audio segments based on subtitle timings
- Download the resulting condensed audio

## Usage

1. Upload a video file
2. Upload the corresponding subtitle file
3. Click "Extract Audio" to process the files
4. Download the resulting condensed audio file

## Technical Details

- Built with React and TypeScript
- Uses Web Audio API for audio processing
- Subtitle parsing with @plussub/srt-vtt-parser
- WAV encoding with audiobuffer-to-wav

## Installation

1. Clone the repository
2. Run `npm install` to install dependencies
3. Use `npm run dev` to start the development server

## Dependencies

- React
- TypeScript
- @plussub/srt-vtt-parser
- audiobuffer-to-wav

## Contributing

Contributions are welcome.
