import { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, Play, Pause, Settings, BarChart3, BookOpen, Wifi, WifiOff, Circle, Plus, Trash2, Save, Power, Zap, Target, Eye, Activity, AlertCircle, CheckCircle, Clock, TrendingUp } from 'lucide-react';

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
      thumbs_up: { name: 'thumbs_up', icon: '👍', count: 0, lastDetected: null },
      peace: { name: 'peace', icon: '✌️', count: 0, lastDetected: null },
      ok: { name: 'ok', icon: '👌', count: 0, lastDetected: null },
      pointing: { name: 'pointing', icon: '👉', count: 0, lastDetected: null },
      open_palm: { name: 'open_palm', icon: '🖐️', count: 0, lastDetected: null },
      fist: { name: 'fist', icon: '✊', count: 0, lastDetected: null },
      rock: { name: 'rock', icon: '🤘', count: 0, lastDetected: null },
      stop: { name: 'stop', icon: '✋', count: 0, lastDetected: null }
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
                  count: prev[data.gesture].count + 1,
                  lastDetected: new Date().toLocaleTimeString()
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
          count: 0,
          lastDetected: null
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

  // Enhanced Status indicator component
  const StatusIndicator = ({ connected, connecting }) => {
    const getStatus = () => {
      if (connected) return { 
        color: 'bg-emerald-500 shadow-emerald-500/50', 
        text: 'Connected',
        icon: <Wifi className="w-4 h-4" />,
        bgColor: 'bg-emerald-50 border-emerald-200',
        textColor: 'text-emerald-700'
      };
      if (connecting) return { 
        color: 'bg-amber-500 shadow-amber-500/50', 
        text: 'Connecting...',
        icon: <Circle className="w-3 h-3 animate-pulse" />,
        bgColor: 'bg-amber-50 border-amber-200',
        textColor: 'text-amber-700'
      };
      return { 
        color: 'bg-rose-500 shadow-rose-500/50', 
        text: 'Disconnected',
        icon: <WifiOff className="w-4 h-4" />,
        bgColor: 'bg-rose-50 border-rose-200',
        textColor: 'text-rose-700'
      };
    };

    const status = getStatus();
    return (
      <div className={`flex items-center space-x-3 px-4 py-2.5 ${status.bgColor} border rounded-xl shadow-sm backdrop-blur-sm`}>
        <div className={`w-3 h-3 rounded-full ${status.color} shadow-lg animate-pulse`} />
        <span className={`text-sm font-semibold ${status.textColor}`}>{status.text}</span>
        <div className={status.textColor}>
          {status.icon}
        </div>
      </div>
    );
  };

  // Enhanced Gesture Display Component
  const GestureDisplay = () => {
    const isActive = currentGesture !== 'Waiting...';
    const confidencePercentage = Math.round(confidence * 100);
    
    return (
      <div className="relative bg-gradient-to-br from-indigo-50 via-white to-purple-50 rounded-2xl p-8 shadow-xl border border-white/60 backdrop-blur-sm">
        <div className="absolute top-4 right-4">
          <div className="flex items-center space-x-2 text-xs font-medium text-gray-500">
            <Activity className="w-4 h-4" />
            <span>{fps} FPS</span>
          </div>
        </div>
        
        <div className="text-center">
          <div className="flex items-center justify-center space-x-2 mb-6">
            <Target className="w-5 h-5 text-indigo-600" />
            <h3 className="text-lg font-semibold text-gray-700">Current Gesture</h3>
          </div>
          
          <div className={`text-8xl font-bold mb-6 transition-all duration-500 ${
            isActive ? 'text-indigo-600 scale-110' : 'text-gray-400'
          }`}>
            {currentGesture === 'Waiting...' ? '🤚' : (gestures[currentGesture]?.icon || '🤚')}
          </div>
          
          <div className="text-2xl font-bold text-gray-800 mb-6 capitalize">
            {currentGesture.replace('_', ' ')}
          </div>
          
          <div className="space-y-4">
            <div className="relative">
              <div className="flex justify-between items-center text-sm font-medium text-gray-600 mb-2">
                <span>Confidence Level</span>
                <span className={`px-2 py-1 rounded-full text-xs ${
                  confidencePercentage >= 80 ? 'bg-green-100 text-green-800' :
                  confidencePercentage >= 60 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {confidencePercentage}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 shadow-inner">
                <div 
                  className={`h-3 rounded-full transition-all duration-300 shadow-sm ${
                    confidencePercentage >= 80 ? 'bg-gradient-to-r from-green-500 to-emerald-500' :
                    confidencePercentage >= 60 ? 'bg-gradient-to-r from-yellow-500 to-orange-500' :
                    'bg-gradient-to-r from-red-500 to-pink-500'
                  }`}
                  style={{ width: `${confidencePercentage}%` }}
                />
              </div>
            </div>
            
            <div className="flex justify-center space-x-4 pt-2">
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <Eye className="w-4 h-4" />
                <span>Tracking Active</span>
              </div>
              <div className="flex items-center space-x-2 text-sm text-gray-600">
                <Zap className="w-4 h-4" />
                <span>Real-time</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Enhanced Header */}
        <div className="text-center mb-8 md:mb-12">
          <div className="inline-flex items-center justify-center bg-white/10 backdrop-blur-md rounded-full px-8 py-3 mb-6 border border-white/20 shadow-lg">
            <Power className="w-6 h-6 text-white mr-3" />
            <span className="text-white font-semibold text-lg">AI Gesture Recognition System</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 mb-4">
            Hand Sign Recognition
          </h1>
          <p className="text-blue-100/90 text-xl md:text-2xl max-w-4xl mx-auto leading-relaxed">
            Advanced AI-powered gesture recognition with real-time processing and machine learning capabilities
          </p>
        </div>

        {/* Enhanced Status Bar */}
        <div className="bg-white/95 backdrop-blur-md rounded-2xl p-6 mb-8 shadow-2xl border border-white/20">
          <div className="flex flex-col lg:flex-row justify-between items-center gap-6">
            <StatusIndicator connected={isConnected} connecting={isConnecting} />
            
            <div className="flex flex-wrap justify-center gap-4">
              <button
                onClick={startRecognition}
                disabled={isConnected || isConnecting}
                className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center space-x-3 shadow-lg hover:shadow-xl hover:scale-105"
              >
                <Play className="w-5 h-5" />
                <span className="font-semibold">Start Recognition</span>
              </button>
              <button
                onClick={stopRecognition}
                disabled={!isConnected}
                className="px-8 py-3 bg-gradient-to-r from-red-600 to-pink-600 text-white rounded-xl hover:from-red-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center space-x-3 shadow-lg hover:shadow-xl hover:scale-105"
              >
                <Pause className="w-5 h-5" />
                <span className="font-semibold">Stop Recognition</span>
              </button>
            </div>
          </div>
        </div>

        {/* Enhanced Main Content Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 mb-8">
          {/* Enhanced Camera Section */}
          <div className="bg-white/95 backdrop-blur-md rounded-2xl p-6 shadow-2xl border border-white/20">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-blue-100 rounded-xl">
                  <Camera className="w-6 h-6 text-blue-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-800">Camera Feed</h2>
              </div>
              <div className={`px-4 py-2 rounded-full text-sm font-semibold ${
                cameraActive 
                  ? 'bg-green-100 text-green-800 border border-green-200' 
                  : 'bg-gray-100 text-gray-600 border border-gray-200'
              }`}>
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${cameraActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                  <span>{cameraActive ? 'Active' : 'Inactive'}</span>
                </div>
              </div>
            </div>
            
            <div className="relative bg-black rounded-xl overflow-hidden mb-6 aspect-video shadow-inner">
              {cameraActive ? (
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex items-center justify-center h-full bg-gradient-to-br from-gray-100 to-gray-200">
                  <div className="text-center p-8">
                    <div className="p-4 bg-white rounded-full shadow-lg mb-4 mx-auto w-fit">
                      <Camera className="w-12 h-12 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-600 mb-2">Camera Inactive</h3>
                    <p className="text-gray-500">Start camera to begin gesture recognition</p>
                  </div>
                </div>
              )}
              <div className="absolute inset-0 border-2 border-dashed border-blue-400/40 rounded-xl pointer-events-none" />
            </div>
            
            <div className="flex flex-wrap gap-3 justify-center">
              <button
                onClick={startCamera}
                disabled={cameraActive}
                className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-xl hover:from-emerald-700 hover:to-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-lg hover:shadow-xl flex items-center space-x-2 font-semibold"
              >
                <Play className="w-4 h-4" />
                <span>Start Camera</span>
              </button>
              <button
                onClick={stopCamera}
                disabled={!cameraActive}
                className="px-6 py-3 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-xl hover:from-gray-700 hover:to-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-lg hover:shadow-xl flex items-center space-x-2 font-semibold"
              >
                <Pause className="w-4 h-4" />
                <span>Stop Camera</span>
              </button>
            </div>
          </div>

          {/* Enhanced Gesture Display */}
          <GestureDisplay />

          {/* Enhanced Log Panel */}
          <div className="bg-white/95 backdrop-blur-md rounded-2xl p-6 shadow-2xl border border-white/20">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center space-x-3">
                <div className="p-2 bg-purple-100 rounded-xl">
                  <BookOpen className="w-6 h-6 text-purple-600" />
                </div>
                <h2 className="text-xl font-bold text-gray-800">System Log</h2>
              </div>
              <button
                onClick={() => setLogs([])}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-all duration-300 text-sm shadow-sm flex items-center space-x-2 font-semibold"
              >
                <Trash2 className="w-4 h-4" />
                <span>Clear</span>
              </button>
            </div>
            
            <div className="h-80 overflow-y-auto bg-gray-50/80 rounded-xl p-4 font-mono text-sm space-y-3 border border-gray-200 shadow-inner">
              {logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-gray-400 py-12">
                  <div className="p-4 bg-gray-200 rounded-full mb-4">
                    <BookOpen className="w-8 h-8" />
                  </div>
                  <span className="text-lg font-medium">No logs available</span>
                  <span className="text-sm mt-1">System events will appear here</span>
                </div>
              ) : (
                logs.map(log => (
                  <div 
                    key={log.id} 
                    className={`p-3 rounded-lg border-l-4 shadow-sm hover:shadow-md transition-all duration-200 ${
                      log.type === 'error' ? 'bg-red-50 border-red-500 text-red-700' :
                      log.type === 'success' ? 'bg-green-50 border-green-500 text-green-700' :
                      'bg-blue-50 border-blue-500 text-blue-700'
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <div className="pt-1">
                        {log.type === 'error' ? <AlertCircle className="w-4 h-4" /> :
                         log.type === 'success' ? <CheckCircle className="w-4 h-4" /> :
                         <Clock className="w-4 h-4" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <span className="font-medium">{log.message}</span>
                          <span className="text-xs opacity-70">{log.timestamp}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Enhanced Tabs Section */}
        <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl overflow-hidden border border-white/20">
          <div className="flex bg-gradient-to-r from-blue-50 via-purple-50 to-pink-50 border-b border-gray-200">
            {[
              { id: 'training', label: 'Gesture Training', icon: BookOpen, color: 'text-blue-600' },
              { id: 'statistics', label: 'Statistics', icon: BarChart3, color: 'text-purple-600' },
              { id: 'settings', label: 'Settings', icon: Settings, color: 'text-pink-600' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center space-x-3 py-5 px-6 font-semibold transition-all duration-300 ${
                  activeTab === tab.id
                    ? 'bg-white text-gray-800 border-b-4 border-blue-600 shadow-lg'
                    : 'text-gray-600 hover:bg-white/50 hover:text-gray-800'
                }`}
              >
                <tab.icon className="w-5 h-5" />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="p-8">
            {activeTab === 'training' && (
              <div className="space-y-8">
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-200">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4">Training Configuration</h3>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Gesture Name
                      </label>
                      <div className="flex space-x-3">
                        <input
                          type="text"
                          value={gestureName}
                          onChange={(e) => setGestureName(e.target.value)}
                          className="flex-1 px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white shadow-sm"
                          placeholder="Enter gesture name..."
                        />
                        <button
                          onClick={deleteGesture}
                          className="px-6 py-3 bg-gradient-to-r from-red-600 to-pink-600 text-white rounded-xl hover:from-red-700 hover:to-pink-700 transition-all duration-300 flex items-center space-x-2 shadow-lg hover:shadow-xl font-semibold"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex space-x-4">
                      <button
                        onClick={startRecording}
                        disabled={!isConnected || isRecording}
                        className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center space-x-3 shadow-lg hover:shadow-xl font-semibold"
                      >
                        <Plus className="w-5 h-5" />
                        <span>{isRecording ? 'Recording...' : 'Record Gesture'}</span>
                      </button>
                      <button
                        onClick={stopRecording}
                        disabled={!isRecording}
                        className="px-8 py-3 bg-gradient-to-r from-red-600 to-pink-600 text-white rounded-xl hover:from-red-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center space-x-3 shadow-lg hover:shadow-xl font-semibold"
                      >
                        <Pause className="w-5 h-5" />
                        <span>Stop</span>
                      </button>
                    </div>
                  </div>
                </div>
                
                {isRecording && (
                  <div className="bg-gradient-to-r from-blue-100 to-indigo-100 border border-blue-300 rounded-2xl p-6 shadow-lg">
                    <div className="flex items-start space-x-4">
                      <div className="w-6 h-6 rounded-full bg-blue-500 animate-pulse mt-1 shadow-lg" />
                      <div>
                        <h4 className="font-bold text-blue-800 text-lg mb-2">Recording in Progress</h4>
                        <p className="text-blue-700">Perform the gesture multiple times for better accuracy. The system is learning your gesture patterns.</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'statistics' && (
              <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl p-6 border border-blue-200 shadow-lg">
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-blue-200 rounded-xl">
                        <Target className="w-6 h-6 text-blue-600" />
                      </div>
                      <span className="text-xs font-medium text-blue-600 uppercase tracking-wide">Total Gestures</span>
                    </div>
                    <div className="text-3xl font-bold text-blue-800">{Object.keys(gestures).length}</div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-2xl p-6 border border-green-200 shadow-lg">
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-green-200 rounded-xl">
                        <Activity className="w-6 h-6 text-green-600" />
                      </div>
                      <span className="text-xs font-medium text-green-600 uppercase tracking-wide">Total Detections</span>
                    </div>
                    <div className="text-3xl font-bold text-green-800">
                      {Object.values(gestures).reduce((sum, gesture) => sum + gesture.count, 0)}
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl p-6 border border-purple-200 shadow-lg">
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-purple-200 rounded-xl">
                        <TrendingUp className="w-6 h-6 text-purple-600" />
                      </div>
                      <span className="text-xs font-medium text-purple-600 uppercase tracking-wide">Accuracy</span>
                    </div>
                    <div className="text-3xl font-bold text-purple-800">{Math.round(confidence * 100)}%</div>
                  </div>
                  
                  <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-2xl p-6 border border-orange-200 shadow-lg">
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-3 bg-orange-200 rounded-xl">
                        <Zap className="w-6 h-6 text-orange-600" />
                      </div>
                      <span className="text-xs font-medium text-orange-600 uppercase tracking-wide">FPS</span>
                    </div>
                    <div className="text-3xl font-bold text-orange-800">{fps}</div>
                  </div>
                </div>
                
                <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-800 mb-6 flex items-center space-x-2">
                    <BarChart3 className="w-5 h-5 text-gray-600" />
                    <span>Gesture Statistics</span>
                  </h3>
                  
                  <div className="space-y-4">
                    {Object.entries(gestures).length === 0 ? (
                      <div className="text-center py-12 text-gray-500">
                        <div className="p-4 bg-gray-100 rounded-full mx-auto w-fit mb-4">
                          <BarChart3 className="w-8 h-8 text-gray-400" />
                        </div>
                        <p className="text-lg font-medium">No gesture data available</p>
                        <p className="text-sm mt-1">Start training gestures to see statistics</p>
                      </div>
                    ) : (
                      Object.entries(gestures).map(([key, gesture]) => (
                        <div key={key} className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-xl p-4 border border-gray-200 hover:shadow-md transition-all duration-200">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-4">
                              <div className="text-3xl">{gesture.icon}</div>
                              <div>
                                <div className="font-semibold text-gray-800 capitalize">
                                  {gesture.name.replace('_', ' ')}
                                </div>
                                <div className="text-sm text-gray-600">
                                  Last detected: {gesture.lastDetected || 'Never'}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-2xl font-bold text-gray-800">{gesture.count}</div>
                              <div className="text-sm text-gray-600">detections</div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="space-y-8">
                <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-2xl p-6 border border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-800 mb-6 flex items-center space-x-2">
                    <Settings className="w-5 h-5 text-gray-600" />
                    <span>System Configuration</span>
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Python Path
                      </label>
                      <input
                        type="text"
                        value={settings.pythonPath}
                        onChange={(e) => setSettings({...settings, pythonPath: e.target.value})}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white shadow-sm"
                        placeholder="python"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Script Path
                      </label>
                      <input
                        type="text"
                        value={settings.scriptPath}
                        onChange={(e) => setSettings({...settings, scriptPath: e.target.value})}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white shadow-sm"
                        placeholder="hand_sign_recognizer.py"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Server Port
                      </label>
                      <input
                        type="number"
                        value={settings.serverPort}
                        onChange={(e) => setSettings({...settings, serverPort: parseInt(e.target.value)})}
                        className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 bg-white shadow-sm"
                        placeholder="5000"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        Confidence Threshold
                      </label>
                      <div className="relative">
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          value={settings.confidenceThreshold}
                          onChange={(e) => setSettings({...settings, confidenceThreshold: parseFloat(e.target.value)})}
                          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                        />
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>0%</span>
                          <span className="font-semibold text-blue-600">
                            {Math.round(settings.confidenceThreshold * 100)}%
                          </span>
                          <span>100%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-end mt-6">
                    <button
                      onClick={() => {
                        console.log('Settings saved:', settings);
                      }}
                      className="px-8 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 flex items-center space-x-3 shadow-lg hover:shadow-xl font-semibold"
                    >
                      <Save className="w-5 h-5" />
                      <span>Save Settings</span>
                    </button>
                  </div>
                </div>
                
                <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-2xl p-6 border border-yellow-200">
                  <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center space-x-2">
                    <AlertCircle className="w-5 h-5 text-yellow-600" />
                    <span>System Requirements</span>
                  </h3>
                  
                  <div className="space-y-3 text-sm text-gray-700">
                    <div className="flex items-start space-x-3">
                      <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="font-semibold">Python 3.7+</div>
                        <div className="text-gray-600">Required for the backend recognition system</div>
                      </div>
                    </div>
                    
                    <div className="flex items-start space-x-3">
                      <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="font-semibold">OpenCV & MediaPipe</div>
                        <div className="text-gray-600">Computer vision libraries for gesture recognition</div>
                      </div>
                    </div>
                    
                    <div className="flex items-start space-x-3">
                      <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="font-semibold">WebSocket Server</div>
                        <div className="text-gray-600">Real-time communication between frontend and backend</div>
                      </div>
                    </div>
                    
                    <div className="flex items-start space-x-3">
                      <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="font-semibold">Camera Access</div>
                        <div className="text-gray-600">Webcam required for gesture input</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HandSignRecognition;