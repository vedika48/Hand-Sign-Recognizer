# Hand Sign Recognition System 🤚

An advanced AI-powered hand gesture recognition system combining MediaPipe for real-time hand tracking with a React-based web interface for visualization and control.

## Features ✨

- **Real-time gesture recognition** using MediaPipe
- **9 built-in gestures** including thumbs up, peace sign, OK gesture, and more
- **WebSocket communication** between Python backend and React frontend
- **Beautiful dashboard** with camera feed, gesture display, and system logs
- **Gesture training mode** to record custom gestures
- **Performance metrics** including FPS monitoring
- **Responsive design** works on desktop and mobile browsers

## Supported Gestures 👍

| Gesture       | Icon | Description          |
|---------------|------|----------------------|
| Thumbs Up     | 👍   | Approval gesture     |
| Peace         | ✌️   | Victory sign         |
| OK            | 👌   | Circle with fingers  |
| Pointing      | 👉   | Index finger extended|
| Open Palm     | 🖐️   | All fingers extended |
| Fist          | ✊   | Closed hand          |
| Rock          | 🤘   | Index and pinky out  |
| Stop          | ✋   | Raised open hand     |

## System Architecture 🏗️

```mermaid
graph TD
    A[Webcam] --> B[Python Backend]
    B -->|WebSocket| C[React Frontend]
    B --> D[MediaPipe Hand Tracking]
    C --> E[Gesture Visualization]