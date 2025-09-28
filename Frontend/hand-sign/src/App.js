import React, { useState, useEffect, useRef } from 'react';
import { Camera, Wifi, WifiOff, Hand, Activity, Users, Plus, Trash2, BookOpen, Save, X, Eye, Settings, Zap, AlertCircle, Video, VideoOff } from 'lucide-react';
import './App.css';

const App = () => {
  const [isConnected, setIsConnected] = useState(false);
  const [gestures, setGestures] = useState([]);
  const [fps, setFps] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [totalGesturesDetected, setTotalGesturesDetected] = useState(0);
  const [lastGestureTime, setLastGestureTime] = useState(null);
  const [customGestures, setCustomGestures] = useState([]);
  const [allGestures, setAllGestures] = useState([]);
  const [isLearningMode, setIsLearningMode] = useState(false);
  const [learningGesture, setLearningGesture] = useState('');
  const [learningSamples, setLearningSamples] = useState(0);
  const [showAddGestureModal, setShowAddGestureModal] = useState(false);
  const [newGestureName, setNewGestureName] = useState('');
  const [newGestureDescription, setNewGestureDescription] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const maxReconnectAttempts = 5;
  const frameIntervalRef = useRef(null);

  // Initialize camera with better error handling
  const initializeCamera = async () => {
    try {
      setIsLoading(true);
      setCameraError(null);
      
      // Check if browser supports media devices
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API not supported in this browser');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 }
        },
        audio: false
      });
      
      setCameraStream(stream);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        
        // Wait for video to be ready
        await new Promise((resolve) => {
          if (videoRef.current) {
            videoRef.current.onloadedmetadata = () => {
              resolve();
            };
          }
        });
      }
      setIsCameraActive(true);
      setError(null);
      
      // Start sending frames if connected
      if (isConnected) {
        startFrameSending();
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      let errorMessage = 'Cannot access camera. ';
      
      if (err.name === 'NotAllowedError') {
        errorMessage += 'Please allow camera permissions and refresh the page.';
      } else if (err.name === 'NotFoundError') {
        errorMessage += 'No camera found. Please connect a camera and try again.';
      } else if (err.name === 'NotSupportedError') {
        errorMessage += 'Camera not supported in this browser.';
      } else {
        errorMessage += `Error: ${err.message}`;
      }
      
      setCameraError(errorMessage);
      setIsCameraActive(false);
    } finally {
      setIsLoading(false);
    }
  };

  const stopCamera = () => {
    if (frameIntervalRef.current) {
      cancelAnimationFrame(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => {
        track.stop();
      });
      setCameraStream(null);
    }
    setIsCameraActive(false);
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current || !isCameraActive) return null;
    
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      
      // Ensure video is ready
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        return null;
      }
      
      // Set canvas size to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      // Draw current video frame to canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert to base64 for sending
      return canvas.toDataURL('image/jpeg', 0.7);
    } catch (err) {
      console.error('Error capturing frame:', err);
      return null;
    }
  };

  const connectWebSocket = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    setConnectionStatus('connecting');
    setError(null);
    
    try {
      // Create WebSocket connection with error handling
      const wsUrl = 'ws://localhost:5000';
      wsRef.current = new WebSocket(wsUrl);
      
      wsRef.current.onopen = () => {
        console.log('✅ Connected to hand gesture recognition server');
        setIsConnected(true);
        setConnectionStatus('connected');
        setReconnectAttempts(0);
        setError(null);
        
        // Request initial gesture list
        sendMessage({ type: 'get_gestures' });
        
        // Start sending frames if camera is active
        if (isCameraActive) {
          startFrameSending();
        }
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📨 Received message:', data.type);
          
          if (data.type === 'gesture') {
            setGestures(data.gestures || []);
            setFps(data.fps || 0);
            setIsLearningMode(data.learning_mode || false);
            setLearningGesture(data.learning_gesture || '');
            setLearningSamples(data.learning_samples || 0);
            
            if (data.gestures && data.gestures.length > 0) {
              setTotalGesturesDetected(prev => prev + data.gestures.length);
              setLastGestureTime(new Date());
            }
          } else if (data.type === 'init' || data.type === 'gesture_list' || data.type === 'gesture_list_update') {
            setAllGestures(data.gestures || []);
            setCustomGestures(data.custom_gestures || []);
          } else if (data.status) {
            if (data.status === 'learning_started') {
              setIsLearningMode(true);
              setLearningGesture(data.gesture_name);
              setLearningSamples(0);
              setError(null);
            } else if (data.status === 'success') {
              setIsLearningMode(false);
              setLearningGesture('');
              setLearningSamples(0);
              setShowAddGestureModal(false);
              setNewGestureName('');
              setNewGestureDescription('');
              setError(null);
              sendMessage({ type: 'get_gestures' });
            } else if (data.status === 'cancelled') {
              setIsLearningMode(false);
              setLearningGesture('');
              setLearningSamples(0);
              setShowAddGestureModal(false);
              setError(null);
            } else if (data.status === 'error') {
              setError(data.message || 'An error occurred');
            }
          }
        } catch (error) {
          console.error('❌ Error parsing WebSocket message:', error);
          setError('Error parsing server message');
        }
      };
      
      wsRef.current.onclose = (event) => {
        console.log('🔌 Disconnected from server:', event.code, event.reason);
        setIsConnected(false);
        setConnectionStatus('disconnected');
        setGestures([]);
        setIsLearningMode(false);
        
        // Stop frame sending
        if (frameIntervalRef.current) {
          cancelAnimationFrame(frameIntervalRef.current);
          frameIntervalRef.current = null;
        }
        
        if (event.code !== 1000 && reconnectAttempts < maxReconnectAttempts) {
          const timeout = Math.min(1000 * Math.pow(2, reconnectAttempts), 10000);
          console.log(`🔄 Attempting to reconnect in ${timeout}ms...`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            setReconnectAttempts(prev => prev + 1);
            connectWebSocket();
          }, timeout);
        } else if (reconnectAttempts >= maxReconnectAttempts) {
          setError('Failed to connect to server after multiple attempts. Please check if the backend is running.');
        }
      };
      
      wsRef.current.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        setConnectionStatus('error');
        setError('Connection error. Make sure the Python backend is running on port 5000.');
      };
    } catch (error) {
      console.error('❌ Failed to create WebSocket connection:', error);
      setConnectionStatus('error');
      setError('Failed to create WebSocket connection. The server might be down.');
    }
  };

  const sendMessage = (message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(message));
        return true;
      } catch (err) {
        console.error('Error sending message:', err);
        setError('Failed to send message to server');
        return false;
      }
    } else {
      setError('Not connected to server');
      return false;
    }
  };

  const startFrameSending = () => {
    if (!isConnected || !isCameraActive) return;
    
    // Clear any existing interval
    if (frameIntervalRef.current) {
      cancelAnimationFrame(frameIntervalRef.current);
    }
    
    const sendFrame = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN && isCameraActive) {
        const frameData = captureFrame();
        if (frameData) {
          const sent = sendMessage({
            type: 'frame',
            image_data: frameData,
            timestamp: Date.now()
          });
          
          if (!sent) {
            // Stop sending if message failed
            cancelAnimationFrame(frameIntervalRef.current);
            return;
          }
        }
        frameIntervalRef.current = requestAnimationFrame(sendFrame);
      }
    };
    
    frameIntervalRef.current = requestAnimationFrame(sendFrame);
  };

  const disconnectWebSocket = () => {
    // Clear reconnection timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // Stop frame sending
    if (frameIntervalRef.current) {
      cancelAnimationFrame(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    
    // Close WebSocket
    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnected');
    }
    
    setIsConnected(false);
    setConnectionStatus('disconnected');
    setReconnectAttempts(0);
    setError(null);
  };

  const startLearningGesture = () => {
    if (!newGestureName.trim()) {
      setError('Please enter a gesture name');
      return;
    }
    
    if (!isConnected) {
      setError('Not connected to server');
      return;
    }
    
    const sent = sendMessage({
      type: 'start_learning',
      gesture_name: newGestureName.trim(),
      description: newGestureDescription.trim() || `Custom gesture: ${newGestureName.trim()}`
    });
    
    if (!sent) {
      setError('Failed to start learning gesture');
    }
  };

  const finishLearningGesture = () => {
    if (!sendMessage({ type: 'finish_learning' })) {
      setError('Failed to finish learning gesture');
    }
  };

  const cancelLearningGesture = () => {
    if (!sendMessage({ type: 'cancel_learning' })) {
      setError('Failed to cancel learning gesture');
    }
  };

  const deleteCustomGesture = (gestureName) => {
    if (window.confirm(`Are you sure you want to delete the gesture "${gestureName}"?`)) {
      if (!sendMessage({
        type: 'delete_gesture',
        gesture_name: gestureName
      })) {
        setError('Failed to delete gesture');
      }
    }
  };

  const dismissError = () => {
    setError(null);
    setCameraError(null);
  };

  const toggleCamera = async () => {
    if (isCameraActive) {
      stopCamera();
    } else {
      await initializeCamera();
    }
  };

  const retryConnection = () => {
    dismissError();
    setReconnectAttempts(0);
    connectWebSocket();
  };

  // Effect for WebSocket connection
  useEffect(() => {
    connectWebSocket();
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounted');
      }
      stopCamera();
    };
  }, []);

  // Effect for frame sending when camera or connection changes
  useEffect(() => {
    if (isConnected && isCameraActive) {
      startFrameSending();
    } else {
      if (frameIntervalRef.current) {
        cancelAnimationFrame(frameIntervalRef.current);
        frameIntervalRef.current = null;
      }
    }
    
    return () => {
      if (frameIntervalRef.current) {
        cancelAnimationFrame(frameIntervalRef.current);
      }
    };
  }, [isConnected, isCameraActive]);

  const getGestureEmoji = (gesture) => {
    const emojiMap = {
      'thumbs_up': '👍',
      'thumbs_down': '👎',
      'peace': '✌️',
      'ok': '👌',
      'fist': '✊',
      'open_palm': '✋',
      'pointing': '👉',
      'rock': '🤘',
      'stop': '🛑'
    };
    return emojiMap[gesture] || '🤲';
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return '#10B981';
      case 'connecting': return '#F59E0B';
      case 'error': return '#EF4444';
      default: return '#6B7280';
    }
  };

  const getConnectionStatusIcon = () => {
    switch (connectionStatus) {
      case 'connected': return <Wifi color="#10B981" size={20} />;
      case 'connecting': return <Eye color="#F59E0B" size={20} />;
      case 'error': return <AlertCircle color="#EF4444" size={20} />;
      default: return <WifiOff color="#6B7280" size={20} />;
    }
  };

  const ErrorAlert = () => {
    if (!error && !cameraError) return null;

    return (
      <div className="error-alert">
        <div className="error-content">
          <AlertCircle size={20} />
          <span>{error || cameraError}</span>
          <div className="error-actions">
            {(error && error.includes('connection') || error.includes('server')) && (
              <button onClick={retryConnection} className="btn btn-sm btn-primary">
                Retry
              </button>
            )}
            <button onClick={dismissError} className="error-dismiss">
              <X size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const AddGestureModal = () => {
    if (!showAddGestureModal) return null;

    return (
      <div className="modal-overlay">
        <div className="modal-content">
          <div className="modal-header">
            <h2>
              {!isLearningMode ? 'Add New Gesture' : `Learning: ${learningGesture}`}
            </h2>
            <button 
              onClick={() => {
                if (isLearningMode) {
                  cancelLearningGesture();
                } else {
                  setShowAddGestureModal(false);
                  setNewGestureName('');
                  setNewGestureDescription('');
                }
              }}
              className="modal-close"
              disabled={isLoading}
            >
              <X size={20} />
            </button>
          </div>
          
          <div className="modal-body">
            {!isLearningMode ? (
              <>
                <div className="form-group">
                  <label>Gesture Name:</label>
                  <input
                    type="text"
                    value={newGestureName}
                    onChange={(e) => setNewGestureName(e.target.value)}
                    placeholder="Enter gesture name (e.g., wave, salute)"
                    className="form-input"
                    maxLength={20}
                    disabled={isLoading}
                  />
                </div>
                <div className="form-group">
                  <label>Description (optional):</label>
                  <input
                    type="text"
                    value={newGestureDescription}
                    onChange={(e) => setNewGestureDescription(e.target.value)}
                    placeholder="Brief description of the gesture"
                    className="form-input"
                    maxLength={50}
                    disabled={isLoading}
                  />
                </div>
                <div className="form-info">
                  <p>After clicking "Start Learning", perform the gesture multiple times in front of the camera. The system needs at least 10 samples to learn your gesture effectively.</p>
                </div>
              </>
            ) : (
              <div className="learning-status">
                <div className="learning-progress">
                  <div className="progress-circle">
                    <div className="progress-ring">
                      <div 
                        className="progress-ring-fill" 
                        style={{
                          transform: `rotate(${(learningSamples / 10) * 360}deg)`
                        }}
                      ></div>
                    </div>
                    <span className="progress-text">{learningSamples}/10</span>
                  </div>
                  <div className="progress-info">
                    <h3>Learning in Progress...</h3>
                    <p>Perform the "{learningGesture}" gesture in front of the camera</p>
                    <p>Samples collected: {learningSamples}/10</p>
                    {learningSamples >= 10 && (
                      <p className="ready-message">✅ Ready to save! Click "Finish Learning"</p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div className="modal-footer">
            {!isLearningMode ? (
              <>
                <button 
                  onClick={() => {
                    setShowAddGestureModal(false);
                    setNewGestureName('');
                    setNewGestureDescription('');
                  }}
                  className="btn btn-secondary"
                  disabled={isLoading}
                >
                  Cancel
                </button>
                <button 
                  onClick={startLearningGesture}
                  disabled={!newGestureName.trim() || !isConnected || isLoading}
                  className="btn btn-primary"
                >
                  {isLoading ? (
                    'Loading...'
                  ) : (
                    <>
                      <BookOpen size={16} /> Start Learning
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <button 
                  onClick={cancelLearningGesture}
                  className="btn btn-danger"
                  disabled={isLoading}
                >
                  Cancel Learning
                </button>
                <button 
                  onClick={finishLearningGesture}
                  disabled={learningSamples < 5 || isLoading}
                  className="btn btn-success"
                >
                  {isLoading ? (
                    'Saving...'
                  ) : (
                    <>
                      <Save size={16} /> Finish Learning
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="header-left">
            <Hand className="header-icon" />
            <h1>Hand Gesture Recognition</h1>
            {isLearningMode && (
              <div className="learning-indicator">
                <BookOpen size={16} />
                <span>Learning Mode</span>
              </div>
            )}
          </div>
          
          <div className="header-right">
            <div className="connection-status">
              {getConnectionStatusIcon()}
              <span 
                className="status-text"
                style={{ color: getConnectionStatusColor() }}
              >
                {connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1)}
              </span>
              {reconnectAttempts > 0 && (
                <span className="reconnect-counter">
                  ({reconnectAttempts}/{maxReconnectAttempts})
                </span>
              )}
            </div>
            
            <div className="connection-controls">
              {isConnected && !isLearningMode && (
                <button 
                  onClick={() => setShowAddGestureModal(true)}
                  className="btn btn-success"
                  title="Add new custom gesture"
                  disabled={isLoading}
                >
                  <Plus size={16} /> Add Gesture
                </button>
              )}
              <button 
                onClick={toggleCamera}
                className={`btn ${isCameraActive ? 'btn-danger' : 'btn-primary'}`}
                title={isCameraActive ? 'Turn off camera' : 'Turn on camera'}
                disabled={isLoading}
              >
                {isLoading ? (
                  '...'
                ) : isCameraActive ? (
                  <VideoOff size={16} />
                ) : (
                  <Video size={16} />
                )}
                {isCameraActive ? 'Stop Camera' : 'Start Camera'}
              </button>
              <button 
                onClick={() => setShowSettings(!showSettings)}
                className="btn btn-secondary"
                title="Settings"
                disabled={isLoading}
              >
                <Settings size={16} />
              </button>
              {isConnected ? (
                <button onClick={disconnectWebSocket} className="btn btn-danger" disabled={isLoading}>
                  Disconnect
                </button>
              ) : (
                <button onClick={retryConnection} className="btn btn-primary" disabled={isLoading}>
                  {isLoading ? 'Connecting...' : 'Connect'}
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <ErrorAlert />

      <main className="app-main">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon-container">
              <Activity className="stat-icon" />
            </div>
            <div className="stat-content">
              <span className="stat-value">{fps}</span>
              <span className="stat-label">FPS</span>
            </div>
            <div className="stat-trend">
              <Zap size={12} />
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon-container">
              <Hand className="stat-icon" />
            </div>
            <div className="stat-content">
              <span className="stat-value">{gestures.length}</span>
              <span className="stat-label">Active Hands</span>
            </div>
            <div className="stat-trend">
              <Eye size={12} />
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon-container">
              <Users className="stat-icon" />
            </div>
            <div className="stat-content">
              <span className="stat-value">{totalGesturesDetected}</span>
              <span className="stat-label">Total Detected</span>
            </div>
            <div className="stat-trend">
              <Activity size={12} />
            </div>
          </div>
          
          <div className="stat-card">
            <div className="stat-icon-container">
              <Camera className="stat-icon" />
            </div>
            <div className="stat-content">
              <span className="stat-value">
                {lastGestureTime ? lastGestureTime.toLocaleTimeString() : '--:--:--'}
              </span>
              <span className="stat-label">Last Detection</span>
            </div>
            <div className="stat-trend">
              <Activity size={12} />
            </div>
          </div>
        </div>

        <div className="content-grid">
          <div className="camera-section">
            <div className="section-header">
              <h2>Live Camera Feed</h2>
              <div className="camera-controls">
                <div className="status-indicator">
                  {isCameraActive ? (
                    <span className="status-dot recording"></span>
                  ) : (
                    <span className="status-dot disconnected"></span>
                  )}
                  <span>{isCameraActive ? 'Camera Active' : 'Camera Off'}</span>
                </div>
              </div>
            </div>
            <div className="camera-container">
              {isCameraActive ? (
                <div className="camera-feed">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="camera-video"
                  />
                  <canvas ref={canvasRef} style={{ display: 'none' }} />
                  <div className="camera-overlay">
                    {gestures.length > 0 && (
                      <div className="gesture-overlay">
                        {gestures.map((gesture, index) => (
                          <div key={index} className="gesture-badge">
                            {getGestureEmoji(gesture.gesture)} {gesture.description}
                          </div>
                        ))}
                      </div>
                    )}
                    {isLearningMode && (
                      <div className="learning-overlay">
                        <div className="learning-pulse">
                          <BookOpen size={24} />
                          <span>Learning: {learningGesture}</span>
                          <span>{learningSamples}/10 samples</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="camera-placeholder">
                  <Camera size={64} color="#6B7280" />
                  <h3>Camera Feed</h3>
                  <p>Click "Start Camera" to begin gesture recognition</p>
                  {!isConnected && (
                    <p className="connection-info">
                      Connect to the backend server first
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="gestures-section">
            <div className="section-header">
              <h2>Detected Gestures</h2>
              <div className="gesture-count">
                {gestures.length} active
              </div>
            </div>
            {gestures.length > 0 ? (
              <div className="gestures-list">
                {gestures.map((gesture, index) => (
                  <div 
                    key={`${gesture.gesture}-${gesture.hand_index}-${index}`}
                    className={`gesture-card ${gesture.is_custom ? 'custom-gesture' : ''}`}
                  >
                    <div className="gesture-emoji">
                      {getGestureEmoji(gesture.gesture)}
                    </div>
                    <div className="gesture-info">
                      <h3>
                        {gesture.description}
                        {gesture.is_custom && <span className="custom-badge">CUSTOM</span>}
                      </h3>
                      <div className="gesture-details">
                        <span>Hand {gesture.hand_index + 1}</span>
                        <span className="confidence">
                          {(gesture.confidence * 100).toFixed(1)}% confidence
                        </span>
                      </div>
                      <div className="gesture-position">
                        Position: ({gesture.hand_position[0].toFixed(2)}, {gesture.hand_position[1].toFixed(2)})
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-gestures">
                <Hand size={48} color="#6B7280" />
                <p>
                  {isConnected && isCameraActive
                    ? (isLearningMode 
                        ? `Learning "${learningGesture}" - perform the gesture now!`
                        : 'No gestures detected. Show your hand to the camera!')
                    : 'Connect and enable camera to start detecting gestures'
                  }
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="gestures-management">
          <div className="supported-gestures">
            <h3>Built-in Gestures</h3>
            <div className="gesture-grid">
              {[
                { name: 'Thumbs Up', emoji: '👍', key: 'thumbs_up' },
                { name: 'Thumbs Down', emoji: '👎', key: 'thumbs_down' },
                { name: 'Peace Sign', emoji: '✌️', key: 'peace' },
                { name: 'OK Gesture', emoji: '👌', key: 'ok' },
                { name: 'Fist', emoji: '✊', key: 'fist' },
                { name: 'Open Palm', emoji: '✋', key: 'open_palm' },
                { name: 'Pointing', emoji: '👉', key: 'pointing' },
                { name: 'Rock Sign', emoji: '🤘', key: 'rock' },
                { name: 'Stop', emoji: '🛑', key: 'stop' }
              ].map((item) => (
                <div 
                  key={item.key} 
                  className={`supported-gesture ${gestures.some(g => g.gesture === item.key) ? 'active' : ''}`}
                >
                  <span className="supported-emoji">{item.emoji}</span>
                  <span className="supported-name">{item.name}</span>
                </div>
              ))}
            </div>
          </div>

          {customGestures.length > 0 && (
            <div className="custom-gestures">
              <h3>Custom Gestures ({customGestures.length})</h3>
              <div className="gesture-grid">
                {customGestures.map((gestureName) => (
                  <div 
                    key={gestureName}
                    className={`supported-gesture custom-gesture-item ${gestures.some(g => g.gesture === gestureName) ? 'active' : ''}`}
                  >
                    <div className="custom-gesture-content">
                      <span className="supported-emoji">🤲</span>
                      <span className="supported-name">{gestureName}</span>
                    </div>
                    <button
                      onClick={() => deleteCustomGesture(gestureName)}
                      className="delete-gesture-btn"
                      title="Delete custom gesture"
                      disabled={isLoading}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      <AddGestureModal />
    </div>
  );
};

export default App;