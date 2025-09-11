import cv2
import mediapipe as mp
import numpy as np
import asyncio
import websockets
import json
import time
from scipy.spatial import distance
from collections import deque
import warnings
import logging
from typing import Dict, List, Tuple, Optional, Callable
import pickle
import os
warnings.filterwarnings('ignore')

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class CustomGesture:
    """Class to handle custom gesture definitions"""
    def __init__(self, name: str, description: str, detection_function: Callable, confidence_threshold: float = 0.8):
        self.name = name
        self.description = description
        self.detection_function = detection_function
        self.confidence_threshold = confidence_threshold
        self.created_at = time.time()

class EnhancedHandSignRecognizer:
    def __init__(self, port=5000):
        print("🚀 Initializing Enhanced Hand Sign Recognition System...")
        
        # Initialize MediaPipe with optimized settings
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=2,
            min_detection_confidence=0.7,  # Slightly lower for better detection
            min_tracking_confidence=0.5   # Lower for better tracking
        )
        self.mp_drawing = mp.solutions.drawing_utils
        self.mp_drawing_styles = mp.solutions.drawing_styles
        
        # Enhanced socket configuration
        self.port = port
        self.clients = set()
        
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
        
        # Custom gestures storage
        self.custom_gestures: Dict[str, CustomGesture] = {}
        self.gesture_training_data = {}
        self.is_learning_mode = False
        self.learning_gesture_name = None
        self.learning_samples = []
        
        # Gesture smoothing and stability
        self.gesture_history = deque(maxlen=10)
        self.last_gesture = None
        self.gesture_stability_threshold = 0.6  # Lowered for better responsiveness
        
        # Performance metrics
        self.fps_counter = 0
        self.fps_start_time = time.time()
        self.current_fps = 0
        
        # Load saved custom gestures
        self.load_custom_gestures()
        
        print("✅ System initialized successfully!")
    
    def save_custom_gestures(self):
        """Save custom gestures to file"""
        try:
            data = {}
            for name, gesture in self.custom_gestures.items():
                # We can't pickle functions, so we'll save the training data instead
                if name in self.gesture_training_data:
                    data[name] = {
                        'description': gesture.description,
                        'confidence_threshold': gesture.confidence_threshold,
                        'training_data': self.gesture_training_data[name],
                        'created_at': gesture.created_at
                    }
            
            with open('custom_gestures.pkl', 'wb') as f:
                pickle.dump(data, f)
            print("✅ Custom gestures saved successfully")
        except Exception as e:
            logger.error(f"Error saving custom gestures: {e}")
    
    def load_custom_gestures(self):
        """Load custom gestures from file"""
        try:
            if os.path.exists('custom_gestures.pkl'):
                with open('custom_gestures.pkl', 'rb') as f:
                    data = pickle.load(f)
                
                for name, gesture_data in data.items():
                    # Create a detection function based on training data
                    detection_func = self.create_learned_detection_function(gesture_data['training_data'])
                    
                    custom_gesture = CustomGesture(
                        name=name,
                        description=gesture_data['description'],
                        detection_function=detection_func,
                        confidence_threshold=gesture_data['confidence_threshold']
                    )
                    custom_gesture.created_at = gesture_data['created_at']
                    
                    self.custom_gestures[name] = custom_gesture
                    self.gesture_training_data[name] = gesture_data['training_data']
                
                print(f"✅ Loaded {len(self.custom_gestures)} custom gestures")
        except Exception as e:
            logger.error(f"Error loading custom gestures: {e}")
    
    def create_learned_detection_function(self, training_data: List[Dict]) -> Callable:
        """Create a detection function based on learned gesture patterns"""
        def detect_learned_gesture(features):
            if not features or not training_data:
                return False, 0.0
            
            # Calculate similarity to training samples
            similarities = []
            current_pattern = self.extract_gesture_pattern(features)
            
            for sample in training_data:
                similarity = self.calculate_pattern_similarity(current_pattern, sample['pattern'])
                similarities.append(similarity)
            
            if similarities:
                max_similarity = max(similarities)
                avg_similarity = np.mean(similarities)
                
                # Use both max and average for better accuracy
                final_confidence = (max_similarity * 0.7 + avg_similarity * 0.3)
                return final_confidence > 0.7, final_confidence
            
            return False, 0.0
        
        return detect_learned_gesture
    
    def extract_gesture_pattern(self, features) -> Dict:
        """Extract a pattern representation of the gesture"""
        if not features:
            return {}
        
        return {
            'finger_states': features['finger_states'],
            'finger_ratios': [d / max(features['finger_distances']) if max(features['finger_distances']) > 0 else 0 
                             for d in features['finger_distances']],
            'hand_orientation': features['hand_orientation'],
            'finger_angles': features.get('finger_angles', []),
        }
    
    def calculate_pattern_similarity(self, pattern1: Dict, pattern2: Dict) -> float:
        """Calculate similarity between two gesture patterns"""
        if not pattern1 or not pattern2:
            return 0.0
        
        similarities = []
        
        # Compare finger states
        if 'finger_states' in pattern1 and 'finger_states' in pattern2:
            finger_similarity = sum(a == b for a, b in zip(pattern1['finger_states'], pattern2['finger_states'])) / 5.0
            similarities.append(finger_similarity)
        
        # Compare finger ratios
        if 'finger_ratios' in pattern1 and 'finger_ratios' in pattern2:
            ratio_diff = np.mean([abs(a - b) for a, b in zip(pattern1['finger_ratios'], pattern2['finger_ratios'])])
            ratio_similarity = max(0, 1 - ratio_diff)
            similarities.append(ratio_similarity)
        
        # Compare hand orientation
        if 'hand_orientation' in pattern1 and 'hand_orientation' in pattern2:
            orientation_diff = abs(pattern1['hand_orientation'] - pattern2['hand_orientation'])
            orientation_similarity = max(0, 1 - orientation_diff / np.pi)
            similarities.append(orientation_similarity)
        
        return np.mean(similarities) if similarities else 0.0
    
    def start_learning_gesture(self, gesture_name: str, description: str = ""):
        """Start learning a new custom gesture"""
        self.is_learning_mode = True
        self.learning_gesture_name = gesture_name
        self.learning_samples = []
        
        if not description:
            description = f"Custom gesture: {gesture_name}"
        
        print(f"🎓 Started learning gesture: {gesture_name}")
        return {
            'status': 'learning_started',
            'gesture_name': gesture_name,
            'description': description,
            'samples_needed': 10
        }
    
    def add_learning_sample(self, features):
        """Add a sample for the gesture being learned"""
        if not self.is_learning_mode or not features:
            return False
        
        pattern = self.extract_gesture_pattern(features)
        self.learning_samples.append({
            'pattern': pattern,
            'timestamp': time.time()
        })
        
        print(f"📝 Added sample {len(self.learning_samples)} for {self.learning_gesture_name}")
        return len(self.learning_samples)
    
    def finish_learning_gesture(self):
        """Finish learning and save the custom gesture"""
        if not self.is_learning_mode or len(self.learning_samples) < 5:
            return {'status': 'error', 'message': 'Need at least 5 samples to create gesture'}
        
        # Create the custom gesture
        detection_func = self.create_learned_detection_function(self.learning_samples)
        
        custom_gesture = CustomGesture(
            name=self.learning_gesture_name,
            description=f"Custom gesture: {self.learning_gesture_name}",
            detection_function=detection_func,
            confidence_threshold=0.75
        )
        
        # Save the gesture
        self.custom_gestures[self.learning_gesture_name] = custom_gesture
        self.gesture_training_data[self.learning_gesture_name] = self.learning_samples.copy()
        
        # Add to sign database
        self.sign_database[self.learning_gesture_name] = {
            'description': custom_gesture.description,
            'confidence_threshold': custom_gesture.confidence_threshold,
            'custom': True
        }
        
        # Reset learning state
        result = {
            'status': 'success',
            'gesture_name': self.learning_gesture_name,
            'samples_collected': len(self.learning_samples)
        }
        
        self.is_learning_mode = False
        self.learning_gesture_name = None
        self.learning_samples = []
        
        # Save to file
        self.save_custom_gestures()
        
        print(f"✅ Successfully created custom gesture: {result['gesture_name']}")
        return result
    
    def cancel_learning(self):
        """Cancel the current learning session"""
        result = {
            'status': 'cancelled',
            'gesture_name': self.learning_gesture_name,
            'samples_discarded': len(self.learning_samples)
        }
        
        self.is_learning_mode = False
        self.learning_gesture_name = None
        self.learning_samples = []
        
        print(f"❌ Cancelled learning for: {result['gesture_name']}")
        return result
    
    def delete_custom_gesture(self, gesture_name: str):
        """Delete a custom gesture"""
        if gesture_name in self.custom_gestures:
            del self.custom_gestures[gesture_name]
            if gesture_name in self.gesture_training_data:
                del self.gesture_training_data[gesture_name]
            if gesture_name in self.sign_database:
                del self.sign_database[gesture_name]
            
            self.save_custom_gestures()
            print(f"🗑️ Deleted custom gesture: {gesture_name}")
            return {'status': 'success', 'message': f'Gesture {gesture_name} deleted'}
        else:
            return {'status': 'error', 'message': f'Gesture {gesture_name} not found'}
    
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
        
        # Calculate finger extensions with better logic
        thumb_extended = distance.euclidean(thumb_tip, thumb_mcp) > distance.euclidean(thumb_mcp, wrist) * 0.5
        index_extended = distance.euclidean(index_tip, index_mcp) > distance.euclidean(index_mcp, wrist) * 0.6
        middle_extended = distance.euclidean(middle_tip, middle_mcp) > distance.euclidean(middle_mcp, wrist) * 0.6
        ring_extended = distance.euclidean(ring_tip, ring_mcp) > distance.euclidean(ring_mcp, wrist) * 0.6
        pinky_extended = distance.euclidean(pinky_tip, pinky_mcp) > distance.euclidean(pinky_mcp, wrist) * 0.5
        
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
        
        cos_angle = np.dot(vector1, vector2) / (np.linalg.norm(vector1) * np.linalg.norm(vector2) + 1e-8)
        cos_angle = np.clip(cos_angle, -1, 1)
        angle = np.arccos(cos_angle)
        
        return np.degrees(angle)
    
    def recognize_gesture(self, features):
        """Advanced gesture recognition using hand features"""
        if not features:
            return None, 0.0
        
        finger_states = features['finger_states']
        finger_distances = features['finger_distances']
        
        # Check custom gestures first
        for name, custom_gesture in self.custom_gestures.items():
            try:
                detected, confidence = custom_gesture.detection_function(features)
                if detected and confidence > custom_gesture.confidence_threshold:
                    return name, confidence
            except Exception as e:
                logger.error(f"Error in custom gesture detection for {name}: {e}")
        
        # Built-in gesture recognition
        # Thumbs up detection (improved)
        if finger_states[0] and not any(finger_states[1:]):
            thumb_up_confidence = 0.9 if features['hand_orientation'] < -0.5 else 0.7
            return 'thumbs_up', thumb_up_confidence
        
        # Thumbs down detection (improved)
        if finger_states[0] and not any(finger_states[1:]) and features['hand_orientation'] > 1.0:
            return 'thumbs_down', 0.9
        
        # Peace sign (index and middle extended)
        if finger_states[1] and finger_states[2] and not finger_states[0] and not finger_states[3] and not finger_states[4]:
            return 'peace', 0.85
        
        # OK gesture (thumb and index forming circle)
        try:
            thumb_index_distance = distance.euclidean(features['landmarks'][4], features['landmarks'][8])
            if thumb_index_distance < 0.05 and finger_states[2] and finger_states[3] and finger_states[4]:
                return 'ok', 0.85
        except:
            pass
        
        # Fist (no fingers extended)
        if not any(finger_states):
            return 'fist', 0.9
        
        # Open palm (all fingers extended)
        if all(finger_states):
            # Check if it's more like a stop gesture (vertical)
            if abs(features['hand_orientation']) < 0.8:
                return 'stop', 0.8
            return 'open_palm', 0.8
        
        # Pointing (only index extended)
        if finger_states[1] and not finger_states[0] and not finger_states[2] and not finger_states[3] and not finger_states[4]:
            return 'pointing', 0.85
        
        # Rock sign (index and pinky extended)
        if finger_states[1] and finger_states[4] and not finger_states[2] and not finger_states[3]:
            return 'rock', 0.8
        
        return None, 0.0
    
    def smooth_gesture(self, gesture, confidence):
        """Apply temporal smoothing to gesture recognition"""
        if gesture is None:
            return None, 0.0
        
        # Add to history
        self.gesture_history.append((gesture, confidence))
        
        # Calculate gesture stability
        if len(self.gesture_history) < 3:  # Reduced for better responsiveness
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
            'type': 'gesture',
            'timestamp': time.time(),
            'gestures': [],
            'fps': self.current_fps,
            'learning_mode': self.is_learning_mode,
            'learning_gesture': self.learning_gesture_name,
            'learning_samples': len(self.learning_samples) if self.is_learning_mode else 0
        }
        
        if results.multi_hand_landmarks:
            for hand_idx, hand_landmarks in enumerate(results.multi_hand_landmarks):
                # Extract hand features
                features = self.calculate_hand_features(hand_landmarks)
                
                # If in learning mode, add sample
                if self.is_learning_mode and features:
                    sample_count = self.add_learning_sample(features)
                    gesture_data['learning_samples'] = sample_count
                
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
                        'hand_position': features['palm_center'].tolist(),
                        'is_custom': stable_gesture in self.custom_gestures
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
    
    async def register_client(self, websocket, path):
        """Register a new client"""
        self.clients.add(websocket)
        print(f"Client connected to path: {path}")
        print(f"📱 Client connected. Total clients: {len(self.clients)}")
        
        # Send initial data
        initial_data = {
            'type': 'init',
            'supported_gestures': list(self.sign_database.keys()),
            'custom_gestures': list(self.custom_gestures.keys())
        }
        await websocket.send(json.dumps(initial_data))
        
        try:
            # Handle incoming messages
            async for message in websocket:
                try:
                    data = json.loads(message)
                    await self.handle_client_message(websocket, data)
                except json.JSONDecodeError:
                    logger.error("Invalid JSON received from client")
        except websockets.exceptions.ConnectionClosed:
            print("📱 Client connection closed")
        finally:
            self.clients.remove(websocket)
            print(f"📱 Client disconnected. Total clients: {len(self.clients)}")
    
    async def handle_client_message(self, websocket, data):
        """Handle messages from clients"""
        message_type = data.get('type')
        
        if message_type == 'start_learning':
            gesture_name = data.get('gesture_name')
            description = data.get('description', '')
            result = self.start_learning_gesture(gesture_name, description)
            await websocket.send(json.dumps(result))
        
        elif message_type == 'finish_learning':
            result = self.finish_learning_gesture()
            await websocket.send(json.dumps(result))
            # Broadcast updated gesture list to all clients
            await self.broadcast_gesture_list_update()
        
        elif message_type == 'cancel_learning':
            result = self.cancel_learning()
            await websocket.send(json.dumps(result))
        
        elif message_type == 'delete_gesture':
            gesture_name = data.get('gesture_name')
            result = self.delete_custom_gesture(gesture_name)
            await websocket.send(json.dumps(result))
            if result['status'] == 'success':
                await self.broadcast_gesture_list_update()
        
        elif message_type == 'get_gestures':
            gesture_list = {
                'type': 'gesture_list',
                'gestures': list(self.sign_database.keys()),
                'custom_gestures': list(self.custom_gestures.keys())
            }
            await websocket.send(json.dumps(gesture_list))
    
    async def broadcast_gesture_list_update(self):
        """Broadcast updated gesture list to all clients"""
        update_data = {
            'type': 'gesture_list_update',
            'gestures': list(self.sign_database.keys()),
            'custom_gestures': list(self.custom_gestures.keys())
        }
        await self.broadcast_to_clients(update_data)
    
    async def broadcast_to_clients(self, data):
        """Send data to all connected clients"""
        if self.clients:
            message = json.dumps(data)
            disconnected_clients = []
            
            for client in self.clients.copy():
                try:
                    await client.send(message)
                except websockets.exceptions.ConnectionClosed:
                    disconnected_clients.append(client)
                except Exception as e:
                    logger.error(f"Error sending to client: {e}")
                    disconnected_clients.append(client)
            
            # Remove disconnected clients
            for client in disconnected_clients:
                self.clients.discard(client)
    
    async def run_camera_processing(self):
        """Main camera processing loop"""
        print("🎥 Starting camera feed...")
        
        # Initialize camera
        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            print("❌ Error: Could not open camera")
            return
        
        # Set camera properties for better performance
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        cap.set(cv2.CAP_PROP_FPS, 30)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)  # Reduce buffer for lower latency
        
        print("✅ Camera initialized successfully")
        
        try:
            while True:
                ret, frame = cap.read()
                if not ret:
                    print("❌ Failed to read frame from camera")
                    break
                
                # Flip frame horizontally for mirror effect
                frame = cv2.flip(frame, 1)
                
                # Process frame for gesture recognition
                processed_frame, gesture_data = self.process_frame(frame)
                
                # Update FPS
                self.update_fps()
                
                # Add FPS counter to frame
                cv2.putText(processed_frame, f'FPS: {self.current_fps}', 
                           (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
                
                # Add learning mode indicator
                if self.is_learning_mode:
                    cv2.putText(processed_frame, f'Learning: {self.learning_gesture_name} ({len(self.learning_samples)}/10)', 
                               (10, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
                
                # Add gesture information to frame
                if gesture_data['gestures']:
                    for i, gesture_info in enumerate(gesture_data['gestures']):
                        text = f"Hand {gesture_info['hand_index']}: {gesture_info['description']} ({gesture_info['confidence']:.2f})"
                        if gesture_info.get('is_custom'):
                            text += " [CUSTOM]"
                        y_pos = 110 + i * 40
                        cv2.putText(processed_frame, text, (10, y_pos), 
                                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)
                
                # Display frame
                cv2.imshow('Enhanced Hand Sign Recognition', processed_frame)
                
                # Broadcast gesture data to connected clients
                await self.broadcast_to_clients(gesture_data)
                
                # Break on 'q' key press
                if cv2.waitKey(1) & 0xFF == ord('q'):
                    break
                
                # Small delay to prevent excessive CPU usage
                await asyncio.sleep(0.01)
        
        except Exception as e:
            print(f"❌ Error in camera processing: {e}")
            logger.error(f"Camera processing error: {e}")
        
        finally:
            # Clean up
            cap.release()
            cv2.destroyAllWindows()
            print("🎥 Camera feed stopped")
    
    async def start_websocket_server(self):
        """Start the WebSocket server"""
        print(f"🌐 Starting WebSocket server on port {self.port}...")
        
        server = await websockets.serve(
            self.register_client, 
            'localhost', 
            self.port,
            ping_interval=20,
            ping_timeout=10
        )
        
        print(f"✅ WebSocket server running on ws://localhost:{self.port}")
        return server
    
    async def run(self):
        """Run the complete system"""
        print("🚀 Starting Enhanced Hand Sign Recognition System...")
        
        # Start WebSocket server
        server = await self.start_websocket_server()
        
        try:
            # Run camera processing
            await self.run_camera_processing()
        except KeyboardInterrupt:
            print("🛑 Shutting down system...")
        finally:
            server.close()
            await server.wait_closed()
            print("✅ System shutdown complete")
    
    def get_system_stats(self):
        """Get current system statistics"""
        return {
            'connected_clients': len(self.clients),
            'current_fps': self.current_fps,
            'supported_gestures': list(self.sign_database.keys()),
            'custom_gestures': list(self.custom_gestures.keys()),
            'gesture_history_length': len(self.gesture_history),
            'last_gesture': self.last_gesture,
            'learning_mode': self.is_learning_mode,
            'learning_gesture': self.learning_gesture_name,
            'learning_samples': len(self.learning_samples) if self.is_learning_mode else 0
        }


async def main():
    """Main function to run the hand sign recognition system"""
    try:
        # Create and run the recognition system
        recognizer = EnhancedHandSignRecognizer(port=5000)
        await recognizer.run()
    except Exception as e:
        print(f"❌ Fatal error: {e}")
        logger.error(f"Fatal error in main: {e}")


if __name__ == "__main__":
    print("🎯 Enhanced Hand Sign Recognition System with Custom Gestures")
    print("=" * 60)
    print("Controls:")
    print("- Press 'q' to quit")
    print("- WebSocket server available at ws://localhost:5000")
    print("- Custom gesture learning available through web interface")
    print("=" * 60)
    
    # Run the main async function
    asyncio.run(main())