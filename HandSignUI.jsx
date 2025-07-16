import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, Square, Play, Pause, Settings, BarChart3, BookOpen, Wifi, WifiOff, Circle } from 'lucide-react';

const HandSignRecognition = () => {
  // State management
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [currentGesture, setCurrentGesture] = useState('Waiting...');
  const [confidence, setConfidence] = useState(0);
  const [cameraActive, setCameraActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [activeTab, setActiveTab] = useState('training');
  const [gestureName, setGestureName] = useState('');
  const [logs, setLogs] = useState([]);
  const [fps, setFps] = useState(0);
  const [gestures, setGestures] = useState({});
  const [settings, setSettings] = useState({
    pythonPath: 'python',
    scriptPath: 'hand_sign_recognizer.py',
    serverPort: 5000,
    confidenceThreshold: 0.7
  });

  // Refs
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  // Initialize default gestures
  useEffect(() => {
    const defaultGestures = {
      thumbs_up: { name: 'thumbs_up', icon: '👍', count: 0 },
      peace: { name: 'peace', icon: '✌️', count: 0 },
      ok: { name: 'ok', icon: '👌', count: 0 },
      pointing: { name: 'pointing', icon: '👉', count: 0 },
      open_palm: { name: 'open_palm', icon: '🖐️', count: 0 },
      fist: { name: 'fist', icon: '✊', count: 0 },
      rock: { name: 'rock', icon: '🤘', count: 0 },
      stop: { name: 'stop', icon: '✋', count: 0 }
    };
    setGestures(defaultGestures);
  }, []);

  // Logging function
  const addLog = useCallback((message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    const newLog = { id: Date.now(), timestamp, message, type };
    setLogs(prev => [...prev.slice(-99), newLog]);
  }, []);

  // WebSocket connection
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setIsConnecting(true);
    addLog('Connecting to recognition server...', 'info');

    try {
      wsRef.current = new WebSocket(`ws://localhost:${settings.serverPort}`);

      wsRef.current.onopen = () => {
        setIsConnected(true);
        setIsConnecting(false);
        addLog('Connected to recognition server', 'success');
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'gesture') {
            setCurrentGesture(data.gesture);
            setConfidence(data.confidence);
            setFps(data.fps || 0);
            
            // Update gesture count
            if (gestures[data.gesture]) {
              setGestures(prev => ({
                ...prev,
                [data.gesture]: {
                  ...prev[data.gesture],
                  count: prev[data.gesture].count + 1
                }
              }));
            }
          } else if (data.type === 'heartbeat') {
            setFps(data.fps || fps);
          }
        } catch (error) {
          addLog(`Error parsing message: ${error.message}`, 'error');
        }
      };

      wsRef.current.onclose = () => {
        setIsConnected(false);
        setIsConnecting(false);
        addLog('Disconnected from recognition server', 'error');
        
        // Auto-reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          if (!isConnected) {
            connectWebSocket();
          }
        }, 3000);
      };

      wsRef.current.onerror = (error) => {
        addLog('WebSocket error occurred', 'error');
        setIsConnecting(false);
      };

    } catch (error) {
      addLog(`Connection error: ${error.message}`, 'error');
      setIsConnecting(false);
    }
  }, [settings.serverPort, isConnected, fps, gestures, addLog]);

  // Camera functions
  const startCamera = async () => {
    try {
      addLog('Starting camera...', 'info');
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        }
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setCameraActive(true);
        addLog('Camera started successfully', 'success');
      }
    } catch (error) {
      addLog(`Camera error: ${error.message}`, 'error');
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setCameraActive(false);
    addLog('Camera stopped', 'info');
  };

  // Recognition functions
  const startRecognition = () => {
    if (!cameraActive) {
      addLog('Please start camera first', 'error');
      return;
    }
    connectWebSocket();
  };

  const stopRecognition = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    setIsConnected(false);
    setCurrentGesture('Waiting...');
    setConfidence(0);
    setFps(0);
    addLog('Recognition stopped', 'info');
  };

  // Recording functions
  const startRecording = () => {
    if (!gestureName.trim()) {
      addLog('Please enter a gesture name', 'error');
      return;
    }
    if (!cameraActive) {
      addLog('Please start camera first', 'error');
      return;
    }

    setIsRecording(true);
    addLog(`Started recording gesture: ${gestureName}`, 'info');
    
    // Add gesture if it doesn't exist
    if (!gestures[gestureName]) {
      setGestures(prev => ({
        ...prev,
        [gestureName]: {
          name: gestureName,
          icon: '🤚',
          count: 0
        }
      }));
    }
  };

  const stopRecording = () => {
    setIsRecording(false);
    if (gestures[gestureName]) {
      setGestures(prev => ({
        ...prev,
        [gestureName]: {
          ...prev[gestureName],
          count: prev[gestureName].count + 1
        }
      }));
    }
    addLog(`Stopped recording gesture: ${gestureName}`, 'success');
  };

  const deleteGesture = () => {
    if (!gestureName.trim()) {
      addLog('Please enter a gesture name', 'error');
      return;
    }

    if (gestures[gestureName]) {
      const newGestures = { ...gestures };
      delete newGestures[gestureName];
      setGestures(newGestures);
      addLog(`Deleted gesture: ${gestureName}`, 'info');
      setGestureName('');
    } else {
      addLog(`Gesture not found: ${gestureName}`, 'error');
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  // Status indicator component
  const StatusIndicator = ({ connected, connecting }) => {
    const getStatus = () => {
      if (connected) return { color: 'bg-green-500', text: 'Connected' };
      if (connecting) return { color: 'bg-yellow-500', text: 'Connecting...' };
      return { color: 'bg-red-500', text: 'Disconnected' };
    };

    const status = getStatus();
    return (
      <div className="flex items-center space-x-2">
        <div className={`w-3 h-3 rounded-full ${status.color} animate-pulse`} />
        <span className="text-sm font-medium">{status.text}</span>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-blue-800 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">
            🤚 Hand Sign Recognition System
          </h1>
          <p className="text-blue-100 text-lg">
            Advanced AI-powered gesture recognition with real-time processing
          </p>
        </div>

        {/* Status Bar */}
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-6 mb-8 shadow-2xl">
          <div className="flex justify-between items-center flex-wrap gap-4">
            <StatusIndicator connected={isConnected} connecting={isConnecting} />
            <div className="flex space-x-3">
              <button
                onClick={startRecognition}
                disabled={isConnected || isConnecting}
                className="px-6 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center space-x-2"
              >
                <Play className="w-4 h-4" />
                <span>Start Recognition</span>
              </button>
              <button
                onClick={stopRecognition}
                disabled={!isConnected}
                className="px-6 py-2 bg-red-600 text-white rounded-full hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center space-x-2"
              >
                <Pause className="w-4 h-4" />
                <span>Stop Recognition</span>
              </button>
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          {/* Camera Section */}
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center space-x-2 mb-4">
              <Camera className="w-6 h-6 text-blue-600" />
              <h2 className="text-xl font-bold text-gray-800">Camera Feed</h2>
            </div>
            
            <div className="relative bg-black rounded-lg overflow-hidden mb-4" style={{ height: '240px' }}>
              {cameraActive ? (
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400">
                  <span>Click "Start Camera" to begin</span>
                </div>
              )}
              <div className="absolute inset-0 border-2 border-dashed border-blue-500/30 rounded-lg pointer-events-none" />
            </div>
            
            <div className="flex space-x-2 justify-center">
              <button
                onClick={startCamera}
                disabled={cameraActive}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                Start Camera
              </button>
              <button
                onClick={stopCamera}
                disabled={!cameraActive}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                Stop Camera
              </button>
            </div>
          </div>

          {/* Gesture Display */}
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-6 shadow-2xl text-center">
            <h2 className="text-lg text-gray-600 mb-4">Current Gesture</h2>
            <div className="text-4xl font-bold text-gray-800 mb-2 animate-pulse">
              {currentGesture.replace('_', ' ')}
            </div>
            <div className="text-gray-500 mb-2">
              Confidence: {Math.round(confidence * 100)}%
            </div>
            <div className="text-sm text-gray-400">
              FPS: {fps}
            </div>
          </div>

          {/* Log Panel */}
          <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-800">System Log</h2>
              <button
                onClick={() => setLogs([])}
                className="px-3 py-1 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all duration-200 text-sm"
              >
                Clear
              </button>
            </div>
            
            <div className="h-64 overflow-y-auto bg-gray-50 rounded-lg p-3 font-mono text-sm space-y-1">
              {logs.map(log => (
                <div key={log.id} className={`p-2 rounded ${
                  log.type === 'error' ? 'bg-red-100 border-l-4 border-red-500' :
                  log.type === 'success' ? 'bg-green-100 border-l-4 border-green-500' :
                  'bg-blue-100 border-l-4 border-blue-500'
                }`}>
                  <span className="text-gray-500">[{log.timestamp}]</span> {log.message}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tabs Section */}
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl overflow-hidden">
          <div className="flex bg-gray-100">
            {[
              { id: 'training', label: 'Gesture Training', icon: BookOpen },
              { id: 'statistics', label: 'Statistics', icon: BarChart3 },
              { id: 'settings', label: 'Settings', icon: Settings }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center space-x-2 py-4 px-6 font-medium transition-all duration-200 ${
                  activeTab === tab.id
                    ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <tab.icon className="w-5 h-5" />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="p-8">
            {activeTab === 'training' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Gesture Name
                  </label>
                  <input
                    type="text"
                    value={gestureName}
                    onChange={(e) => setGestureName(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Enter gesture name..."
                  />
                </div>
                
                <div className="flex space-x-3">
                  <button
                    onClick={startRecording}
                    disabled={!isConnected || isRecording}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                  >
                    {isRecording ? 'Recording...' : 'Record Gesture'}
                  </button>
                  <button
                    onClick={stopRecording}
                    disabled={!isRecording}
                    className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                  >
                    Stop Recording
                  </button>
                  <button
                    onClick={deleteGesture}
                    className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-all duration-200"
                  >
                    Delete Gesture
                  </button>
                </div>
                
                {isRecording && (
                  <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg">
                    <strong>Recording in progress...</strong> Perform the gesture multiple times for better accuracy.
                  </div>
                )}
              </div>
            )}

            {activeTab === 'statistics' && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Object.values(gestures).map(gesture => (
                  <div
                    key={gesture.name}
                    onClick={() => setGestureName(gesture.name)}
                    className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-6 text-center hover:shadow-lg transition-all duration-200 cursor-pointer hover:scale-105"
                  >
                    <div className="text-4xl mb-3">{gesture.icon}</div>
                    <div className="font-semibold text-gray-800 mb-1">
                      {gesture.name.replace('_', ' ')}
                    </div>
                    <div className="text-gray-600 text-sm">
                      Count: {gesture.count}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Python Command
                  </label>
                  <input
                    type="text"
                    value={settings.pythonPath}
                    onChange={(e) => setSettings(prev => ({ ...prev, pythonPath: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Server Port
                  </label>
                  <input
                    type="number"
                    value={settings.serverPort}
                    onChange={(e) => setSettings(prev => ({ ...prev, serverPort: parseInt(e.target.value) }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Confidence Threshold
                  </label>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.1"
                    value={settings.confidenceThreshold}
                    onChange={(e) => setSettings(prev => ({ ...prev, confidenceThreshold: parseFloat(e.target.value) }))}
                    className="w-full"
                  />
                  <div className="text-sm text-gray-600 mt-1">
                    Current: {Math.round(settings.confidenceThreshold * 100)}%
                  </div>
                </div>
                
                <button
                  onClick={() => addLog('Settings saved successfully', 'success')}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all duration-200"
                >
                  Save Settings
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HandSignRecognition;