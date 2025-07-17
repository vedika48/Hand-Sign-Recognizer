import cv2
import mediapipe as mp
import numpy as np
import socket
import threading
import time
import os
import pickle
import json
from scipy.spatial import distance
from collections import deque
import warnings
warnings.filterwarnings('ignore')

class EnhancedHandSignRecognizer:
    def __init__(self, port=5000):
        print("🚀 Initializing Enhanced Hand Sign Recognition System...")
        
        # Initialize MediaPipe with optimized settings
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=2,
            min_detection_confidence=0.8,
            min_tracking_confidence=0.8
        )
        self.mp_drawing = mp.solutions.drawing_utils
        self.mp_drawing_styles = mp.solutions.drawing_styles
        
        # Enhanced socket configuration
        self.port = port
        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        
        # Sign recognition database
        self.sign_database = {
            'thumbs_up': {'description': 'Thumbs up gesture', 'confidence_threshold': 0.85},
            'thumbs_down': {'description': 'Thumbs down gesture', 'confidence_threshold': 0.85},
            'peace': {'description': 'Peace sign (V)', 'confidence_threshold': 0.80},
            'ok': {'description': 'OK gesture', 'confidence_threshold': 0.80},
            'fist': {'description': 'Closed fist', 'confidence_threshold': 0.85},
            'open_palm': {'description': 'Open palm', 'confidence_threshold': 0.75},
            'pointing': {'description': 'Pointing finger', 'confidence_threshold': 0.80},
            'rock': {'description': 'Rock sign', 'confidence_threshold': 0.80},
            'stop': {'description': 'Stop gesture', 'confidence_threshold': 0.80}
        }
        
        # Gesture smoothing and stability
        self.gesture_history = deque(maxlen=10)
        self.last_gesture = None
        self.gesture_stability_threshold = 0.7
        
        # Client connections
        self.clients = []
        self.is_running = False
        
        # Performance metrics
        self.fps_counter = 0
        self.fps_start_time = time.time()
        self.current_fps = 0
        
        # Data storage
        self.data_dir = "gesture_data"
        os.makedirs(self.data_dir, exist_ok=True)
        
        print("✅ System initialized successfully!")
    
    def calculate_hand_features(self, landmarks):
        """Extract comprehensive hand features from landmarks"""
        if not landmarks:
            return None
        
        # Convert landmarks to numpy array
        points = np.array([[lm.x, lm.y, lm.z] for lm in landmarks.landmark])
        
        # Calculate distances between key points
        thumb_tip = points[4]
        thumb_mcp = points[2]
        index_tip = points[8]
        index_mcp = points[5]
        middle_tip = points[12]
        middle_mcp = points[9]
        ring_tip = points[16]
        ring_mcp = points[13]
        pinky_tip = points[20]
        pinky_mcp = points[17]
        wrist = points[0]
        
        # Calculate finger extensions
        thumb_extended = distance.euclidean(thumb_tip, wrist) > distance.euclidean(thumb_mcp, wrist)
        index_extended = distance.euclidean(index_tip, wrist) > distance.euclidean(index_mcp, wrist)
        middle_extended = distance.euclidean(middle_tip, wrist) > distance.euclidean(middle_mcp, wrist)
        ring_extended = distance.euclidean(ring_tip, wrist) > distance.euclidean(ring_mcp, wrist)
        pinky_extended = distance.euclidean(pinky_tip, wrist) > distance.euclidean(pinky_mcp, wrist)
        
        # Calculate angles between fingers
        thumb_angle = self.calculate_angle(thumb_mcp, thumb_tip, wrist)
        index_angle = self.calculate_angle(index_mcp, index_tip, wrist)
        
        # Hand orientation
        hand_vector = middle_mcp - wrist
        hand_angle = np.arctan2(hand_vector[1], hand_vector[0])
        
        return {
            'finger_states': [thumb_extended, index_extended, middle_extended, ring_extended, pinky_extended],
            'finger_distances': [
                distance.euclidean(thumb_tip, wrist),
                distance.euclidean(index_tip, wrist),
                distance.euclidean(middle_tip, wrist),
                distance.euclidean(ring_tip, wrist),
                distance.euclidean(pinky_tip, wrist)
            ],
            'finger_angles': [thumb_angle, index_angle],
            'hand_orientation': hand_angle,
            'palm_center': np.mean(points, axis=0),
            'landmarks': points
        }
    
    def calculate_angle(self, point1, point2, point3):
        """Calculate angle between three points"""
        vector1 = point1 - point2
        vector2 = point3 - point2
        
        cos_angle = np.dot(vector1, vector2) / (np.linalg.norm(vector1) * np.linalg.norm(vector2))
        cos_angle = np.clip(cos_angle, -1, 1)
        angle = np.arccos(cos_angle)
        
        return np.degrees(angle)
    
    def recognize_gesture(self, features):
        """Advanced gesture recognition using hand features"""
        if not features:
            return None, 0.0
        
        finger_states = features['finger_states']
        finger_distances = features['finger_distances']
        
        # Thumbs up detection
        if finger_states[0] and not any(finger_states[1:]):
            return 'thumbs_up', 0.9
        
        # Thumbs down detection (thumb extended downward)
        if finger_states[0] and not any(finger_states[1:]) and features['hand_orientation'] > 1.5:
            return 'thumbs_down', 0.9
        
        # Peace sign (index and middle extended)
        if finger_states[1] and finger_states[2] and not finger_states[0] and not finger_states[3] and not finger_states[4]:
            return 'peace', 0.85
        
        # OK gesture (thumb and index forming circle)
        thumb_index_distance = distance.euclidean(features['landmarks'][4], features['landmarks'][8])
        if thumb_index_distance < 0.05 and finger_states[2] and finger_states[3] and finger_states[4]:
            return 'ok', 0.85
        
        # Fist (no fingers extended)
        if not any(finger_states):
            return 'fist', 0.9
        
        # Open palm (all fingers extended)
        if all(finger_states):
            return 'open_palm', 0.8
        
        # Pointing (only index extended)
        if finger_states[1] and not finger_states[0] and not finger_states[2] and not finger_states[3] and not finger_states[4]:
            return 'pointing', 0.85
        
        # Rock sign (index and pinky extended)
        if finger_states[1] and finger_states[4] and not finger_states[2] and not finger_states[3]:
            return 'rock', 0.8
        
        # Stop gesture (all fingers extended, vertical orientation)
        if all(finger_states) and abs(features['hand_orientation']) < 0.5:
            return 'stop', 0.8
        
        return None, 0.0
    
    def smooth_gesture(self, gesture, confidence):
        """Apply temporal smoothing to gesture recognition"""
        if gesture is None:
            return None, 0.0
        
        # Add to history
        self.gesture_history.append((gesture, confidence))
        
        # Calculate gesture stability
        if len(self.gesture_history) < 5:
            return gesture, confidence
        
        # Count occurrences of each gesture in recent history
        gesture_counts = {}
        total_confidence = 0
        
        for g, c in list(self.gesture_history)[-5:]:
            if g not in gesture_counts:
                gesture_counts[g] = []
            gesture_counts[g].append(c)
            total_confidence += c
        
        # Find most stable gesture
        most_stable_gesture = None
        max_stability = 0
        
        for g, confidences in gesture_counts.items():
            stability = len(confidences) / 5.0 * np.mean(confidences)
            if stability > max_stability:
                max_stability = stability
                most_stable_gesture = g
        
        if max_stability >= self.gesture_stability_threshold:
            return most_stable_gesture, max_stability
        
        return None, 0.0
    
    def process_frame(self, frame):
        """Process a single frame for hand detection and gesture recognition"""
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = self.hands.process(rgb_frame)
        
        gesture_data = {
            'timestamp': time.time(),
            'gestures': [],
            'fps': self.current_fps
        }
        
        if results.multi_hand_landmarks:
            for hand_idx, hand_landmarks in enumerate(results.multi_hand_landmarks):
                # Extract hand features
                features = self.calculate_hand_features(hand_landmarks)
                
                # Recognize gesture
                gesture, confidence = self.recognize_gesture(features)
                
                # Apply smoothing
                stable_gesture, stable_confidence = self.smooth_gesture(gesture, confidence)
                
                if stable_gesture and stable_confidence > self.sign_database.get(stable_gesture, {}).get('confidence_threshold', 0.7):
                    gesture_info = {
                        'hand_index': hand_idx,
                        'gesture': stable_gesture,
                        'confidence': stable_confidence,
                        'description': self.sign_database[stable_gesture]['description'],
                        'hand_position': features['palm_center'].tolist()
                    }
                    gesture_data['gestures'].append(gesture_info)
                
                # Draw landmarks
                self.mp_drawing.draw_landmarks(
                    frame,
                    hand_landmarks,
                    self.mp_hands.HAND_CONNECTIONS,
                    self.mp_drawing_styles.get_default_hand_landmarks_style(),
                    self.mp_drawing_styles.get_default_hand_connections_style()
                )
        
        return frame, gesture_data
    
    def update_fps(self):
        """Update FPS counter"""
        self.fps_counter += 1
        current_time = time.time()
        
        if current_time - self.fps_start_time >= 1.0:
            self.current_fps = self.fps_counter
            self.fps_counter = 0
            self.fps_start_time = current_time
    
    def broadcast_to_clients(self, data):
        """Send data to all connected clients"""
        message = json.dumps(data) + '\n'
        disconnected_clients = []
        
        for client in self.clients:
            try:
                client.send(message.encode('utf-8'))
            except:
                disconnected_clients.append(client)
        
        # Remove disconnected clients
        for client in disconnected_clients:
            self.clients.remove(client)
            client.close()
    
    def handle_client(self, client_socket, address):
        """Handle individual client connections"""
        print(f"📱 Client connected from {address}")
        
        try:
            while self.is_running:
                # Send heartbeat
                heartbeat = json.dumps({'type': 'heartbeat', 'timestamp': time.time()}) + '\n'
                client_socket.send(heartbeat.encode('utf-8'))
                time.sleep(1)
        except:
            pass
        finally:
            if client_socket in self.clients:
                self.clients.remove(client_socket)
            client_socket.close()
            print(f"📱 Client {address} disconnected")
    
    def start_server(self):
        """Start the socket server"""
        try:
            self.server_socket.bind(('localhost', self.port))
            self.server_socket.listen(5)
            print(f"🌐 Server started on port {self.port}")
            
            while self.is_running:
                try:
                    client_socket, address = self.server_socket.accept()
                    self.clients.append(client_socket)
                    
                    # Start client handler thread
                    client_thread = threading.Thread(
                        target=self.handle_client,
                        args=(client_socket, address)
                    )
                    client_thread.daemon = True
                    client_thread.start()
                    
                except socket.error:
                    break
                    
        except Exception as e:
            print(f"❌ Server error: {e}")
        finally:
            self.server_socket.close()
    
    def save_gesture_data(self, gesture_data):
        """Save gesture data to file"""
        filename = os.path.join(self.data_dir, f"gestures_{int(time.time())}.json")
        
        with open(filename, 'w') as f:
            json.dump(gesture_data, f, indent=2)
    
    def run(self):
        """Main execution loop"""
        print("🎥 Starting camera feed...")
        
        # Start server thread
        self.is_running = True
        server_thread = threading.Thread(target=self.start_server)
        server_thread.daemon = True
        server_thread.start()
        
        # Initialize camera
        cap = cv2.VideoCapture(0)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        cap.set(cv2.CAP_PROP_FPS, 30)
        
        if not cap.isOpened():
            print("❌ Error: Could not open camera")
            return
        
        print("✅ Camera initialized successfully")
        print("🎮 Press 'q' to quit, 's' to save current gesture data")
        
        gesture_log = []
        
        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    print("❌ Error: Could not read frame")
                    break
                
                # Process frame
                processed_frame, gesture_data = self.process_frame(frame)
                
                # Update FPS
                self.update_fps()
                
                # Add FPS to frame
                cv2.putText(processed_frame, f"FPS: {self.current_fps}", (10, 30),
                           cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
                
                # Add gesture info to frame
                y_offset = 60
                for gesture_info in gesture_data['gestures']:
                    text = f"{gesture_info['description']}: {gesture_info['confidence']:.2f}"
                    cv2.putText(processed_frame, text, (10, y_offset),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
                    y_offset += 30
                
                # Broadcast to clients
                if gesture_data['gestures']:
                    self.broadcast_to_clients(gesture_data)
                    gesture_log.append(gesture_data)
                
                # Display frame
                cv2.imshow('Enhanced Hand Sign Recognition', processed_frame)
                
                # Handle keyboard input
                key = cv2.waitKey(1) & 0xFF
                if key == ord('q'):
                    break
                elif key == ord('s'):
                    self.save_gesture_data(gesture_log)
                    print("💾 Gesture data saved!")
                
        except KeyboardInterrupt:
            print("\n🛑 Shutting down...")
        
        finally:
            # Cleanup
            self.is_running = False
            cap.release()
            cv2.destroyAllWindows()
            self.server_socket.close()
            
            # Close all client connections
            for client in self.clients:
                client.close()
            
            print("👋 Goodbye!")

# Example usage and testing
if __name__ == "__main__":
    # Create and run the enhanced hand sign recognizer
    recognizer = EnhancedHandSignRecognizer(port=5000)
    
    print("🔧 Starting Enhanced Hand Sign Recognition System...")
    print("📋 Supported gestures:")
    for gesture, info in recognizer.sign_database.items():
        print(f"  • {gesture}: {info['description']}")
    
    print("\n🎯 Features:")
    print("  • Real-time hand tracking with MediaPipe")
    print("  • Advanced gesture recognition algorithm")
    print("  • Temporal smoothing for stability")
    print("  • Socket server for client communication")
    print("  • Performance monitoring and data logging")
    print("  • Multi-hand support")
    
    # Run the system
    recognizer.run()