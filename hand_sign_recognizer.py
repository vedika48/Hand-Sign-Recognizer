import cv2
import mediapipe as mp
import numpy as np
import socket
import threading
import time
import os
import pickle
from scipy.spatial import distance

class HandSignRecognizer:
    def __init__(self, port=5000):
        # Initialize MediaPipe
        self.mp_hands = mp.solutions.hands
        self.hands = self.mp_hands.Hands(
            static_image_mode=False,
            max_num_hands=2,
            min_detection_confidence=0.7,
            min_tracking_confidence=0.7
        )
        self.mp_drawing = mp.solutions.drawing_utils
        self.mp_drawing_styles = mp.solutions.drawing_styles
        
        # Socket for communication with Java UI
        self.port = port
        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket.bind(('localhost', self.port))
        self.server_socket.listen(1)
        
        # Default gesture database (will be expanded with custom gestures)
        self.gestures_dir = "gestures"
        os.makedirs(self.gestures_dir, exist_ok=True)
        
        # Load gestures or create default ones
        self.load_gestures()
        
        # Tracking variables
        self.client = None
        self.running = False
        self.prev_gesture = "unknown"
        self.gesture_history = []
        self.history_max_length = 5  # For smoothing
        self.calibration_mode = False
        self.recording_gesture = False
        self.recording_name = ""
        self.recording_frames = []
        self.recording_max_frames = 30
        
    def load_gestures(self):
        """Load gestures from files or use defaults"""
        self.gestures = {}
        
        # Try to load saved gestures
        gesture_files = [f for f in os.listdir(self.gestures_dir) 
                        if f.endswith('.pkl')]
        
        if gesture_files:
            for gesture_file in gesture_files:
                name = gesture_file.replace('.pkl', '')
                with open(os.path.join(self.gestures_dir, gesture_file), 'rb') as f:
                    self.gestures[name] = pickle.load(f)
        else:
            # Default gestures as fallback - now using joint angles instead of just extension
            self.gestures = {
                "thumbs_up": {
                    "angles": np.array([0.2, -0.9, -0.9, -0.9, -0.9]),  # Thumb up, others folded
                    "distances": np.array([0.3, 0.8, 0.8, 0.8, 0.8])    # Relative distances
                },
                "victory": {
                    "angles": np.array([-0.9, 0.3, 0.3, -0.9, -0.9]),   # Index and middle up
                    "distances": np.array([0.8, 0.2, 0.2, 0.8, 0.8])
                },
                "ok": {
                    "angles": np.array([0.3, 0.3, -0.9, -0.9, -0.9]),   # Thumb and index forming circle
                    "distances": np.array([0.2, 0.2, 0.8, 0.8, 0.8])
                },
                "pointing": {
                    "angles": np.array([-0.9, 0.3, -0.9, -0.9, -0.9]),  # Index pointing
                    "distances": np.array([0.8, 0.2, 0.8, 0.8, 0.8])
                },
                "five": {
                    "angles": np.array([0.3, 0.3, 0.3, 0.3, 0.3]),      # All fingers extended
                    "distances": np.array([0.2, 0.2, 0.2, 0.2, 0.2])
                }
            }
            
            # Save default gestures
            for name, data in self.gestures.items():
                self.save_gesture(name, data)
    
    def save_gesture(self, name, data):
        """Save a gesture to file"""
        with open(os.path.join(self.gestures_dir, f"{name}.pkl"), 'wb') as f:
            pickle.dump(data, f)
    
    def start_server(self):
        """Start the server to communicate with Java client"""
        print(f"Starting server on port {self.port}")
        self.running = True
        
        # Accept client connection in a separate thread
        thread = threading.Thread(target=self.accept_client)
        thread.daemon = True
        thread.start()
        
    def accept_client(self):
        """Accept a client connection"""
        try:
            self.client, addr = self.server_socket.accept()
            print(f"Connection from {addr}")
            
            # Start reading commands from client
            read_thread = threading.Thread(target=self.read_from_client)
            read_thread.daemon = True
            read_thread.start()
            
            # Start processing video after client connects
            self.process_video()
        except Exception as e:
            print(f"Error accepting client: {e}")
        finally:
            if self.client:
                self.client.close()
            self.server_socket.close()
    
    def read_from_client(self):
        """Read commands from the Java client"""
        try:
            while self.running:
                data = self.client.recv(1024).decode('utf-8').strip()
                if not data:
                    break
                    
                if data.startswith('CALIBRATE:'):
                    self.calibration_mode = True
                    print("Starting calibration mode")
                    
                elif data.startswith('RECORD:'):
                    self.recording_gesture = True
                    self.recording_frames = []
                    self.recording_name = data.split(':')[1]
                    print(f"Recording new gesture: {self.recording_name}")
                    
                elif data == 'STOP_RECORD':
                    if self.recording_gesture and self.recording_frames:
                        # Calculate the average values to use as the gesture template
                        angles_sum = np.zeros(5)
                        distances_sum = np.zeros(5)
                        
                        for frame in self.recording_frames:
                            angles_sum += frame["angles"]
                            distances_sum += frame["distances"]
                        
                        avg_angles = angles_sum / len(self.recording_frames)
                        avg_distances = distances_sum / len(self.recording_frames)
                        
                        # Save the new gesture
                        new_gesture = {
                            "angles": avg_angles,
                            "distances": avg_distances
                        }
                        
                        self.gestures[self.recording_name] = new_gesture
                        self.save_gesture(self.recording_name, new_gesture)
                        
                        self.send_to_client(f"GESTURE_SAVED:{self.recording_name}")
                    
                    self.recording_gesture = False
                    print("Stopped recording gesture")
                    
                elif data == 'STOP_CALIBRATE':
                    self.calibration_mode = False
                    self.send_to_client("CALIBRATION_COMPLETE")
                    print("Ended calibration mode")
                    
                elif data == 'GET_GESTURES' or data == 'LIST_GESTURES':  # Added support for both commands
                    gesture_list = list(self.gestures.keys())
                    self.send_to_client(f"GESTURES:{','.join(gesture_list)}")
                    
                elif data.startswith('DELETE_GESTURE:'):
                    gesture_name = data.split(':')[1]
                    if gesture_name in self.gestures:
                        del self.gestures[gesture_name]
                        try:
                            os.remove(os.path.join(self.gestures_dir, f"{gesture_name}.pkl"))
                        except:
                            pass
                        self.send_to_client(f"DELETED:{gesture_name}")
                
        except Exception as e:
            print(f"Error reading from client: {e}")
    
    def calculate_finger_angles(self, hand_landmarks):
        """Calculate the angles of finger joints to determine pose"""
        # Define landmarks for each finger
        fingers = [
            [1, 2, 3, 4],      # Thumb
            [5, 6, 7, 8],      # Index
            [9, 10, 11, 12],   # Middle
            [13, 14, 15, 16],  # Ring
            [17, 18, 19, 20]   # Pinky
        ]
        
        angles = np.zeros(5)
        
        for i, finger in enumerate(fingers):
            # Get the coordinates of the three joints (for angle calculation)
            if i == 0:  # For thumb we use different points
                p1 = np.array([hand_landmarks.landmark[finger[0]].x, hand_landmarks.landmark[finger[0]].y])
                p2 = np.array([hand_landmarks.landmark[finger[1]].x, hand_landmarks.landmark[finger[1]].y])
                p3 = np.array([hand_landmarks.landmark[finger[2]].x, hand_landmarks.landmark[finger[2]].y])
            else:
                p1 = np.array([hand_landmarks.landmark[0].x, hand_landmarks.landmark[0].y])  # Wrist as base
                p2 = np.array([hand_landmarks.landmark[finger[1]].x, hand_landmarks.landmark[finger[1]].y])
                p3 = np.array([hand_landmarks.landmark[finger[3]].x, hand_landmarks.landmark[finger[3]].y])
            
            # Calculate vectors
            v1 = p1 - p2
            v2 = p3 - p2
            
            # Calculate angle between vectors
            cosine_angle = np.dot(v1, v2) / (np.linalg.norm(v1) * np.linalg.norm(v2))
            angle = np.arccos(np.clip(cosine_angle, -1.0, 1.0))
            
            # Normalize angle to a value between -1 and 1
            # Where 1 is fully extended, -1 is fully bent
            normalized_angle = 1.0 - (angle / np.pi * 2)
            angles[i] = normalized_angle
        
        return angles
    
    def calculate_finger_distances(self, hand_landmarks):
        """Calculate the normalized distances of fingertips to palm center"""
        # Get palm center (average of bases of all fingers except thumb)
        palm_points = [0, 5, 9, 13, 17]
        palm_x = np.mean([hand_landmarks.landmark[i].x for i in palm_points])
        palm_y = np.mean([hand_landmarks.landmark[i].y for i in palm_points])
        palm_center = np.array([palm_x, palm_y])
        
        # Get fingertips
        fingertips = [4, 8, 12, 16, 20]
        distances = np.zeros(5)
        
        # Calculate distance from fingertip to palm
        max_dist = 0
        for i, tip in enumerate(fingertips):
            tip_pos = np.array([hand_landmarks.landmark[tip].x, hand_landmarks.landmark[tip].y])
            dist = np.linalg.norm(tip_pos - palm_center)
            distances[i] = dist
            max_dist = max(max_dist, dist)
        
        # Normalize distances
        if max_dist > 0:
            distances = distances / max_dist
        
        # Invert so that 1.0 is fully extended, 0.0 is to the palm
        distances = 1.0 - distances
        
        return distances
        
    def recognize_gesture(self, finger_angles, finger_distances):
        """Recognize gesture based on finger angles and distances"""
        if self.calibration_mode or self.recording_gesture:
            return "calibrating"
            
        best_match = "unknown"
        best_score = 0.6  # Threshold for minimum match score
        
        for name, template in self.gestures.items():
            # Calculate similarities for angles and distances
            angle_similarity = 1.0 - np.mean(np.abs(finger_angles - template["angles"]))
            dist_similarity = 1.0 - np.mean(np.abs(finger_distances - template["distances"]))
            
            # Combined score (weighted)
            similarity = (angle_similarity * 0.7) + (dist_similarity * 0.3)
            
            if similarity > best_score:
                best_score = similarity
                best_match = name
        
        return best_match
    
    def smooth_gesture_prediction(self, gesture):
        """Smooth gesture predictions to prevent flickering"""
        self.gesture_history.append(gesture)
        if len(self.gesture_history) > self.history_max_length:
            self.gesture_history.pop(0)
            
        # Count frequencies of gestures in history
        gesture_counts = {}
        for g in self.gesture_history:
            if g not in gesture_counts:
                gesture_counts[g] = 0
            gesture_counts[g] += 1
        
        # Find the most common gesture
        most_common = max(gesture_counts, key=gesture_counts.get)
        
        # Only change gesture if it's consistently recognized
        if gesture_counts[most_common] >= self.history_max_length * 0.6:  # 60% threshold
            return most_common
        else:
            return self.prev_gesture
    
    def send_to_client(self, message):
        """Send message to Java client"""
        if self.client:
            try:
                self.client.send((message + "\n").encode())
            except Exception as e:
                print(f"Error sending to client: {e}")
    
    def process_video(self):
        """Process video feed and recognize hand signs"""
        cap = cv2.VideoCapture(0)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        
        frame_count = 0
        
        while self.running:
            success, image = cap.read()
            if not success:
                print("Failed to capture image")
                break
                
            # Flip the image horizontally for a more intuitive mirror view
            image = cv2.flip(image, 1)
            
            # Convert image to RGB for MediaPipe
            image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            results = self.hands.process(image_rgb)
            
            # Display mode status
            if self.calibration_mode:
                cv2.putText(image, "CALIBRATION MODE", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 
                            0.7, (0, 0, 255), 2, cv2.LINE_AA)
            
            if self.recording_gesture:
                cv2.putText(image, f"RECORDING: {self.recording_name}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 
                            0.7, (0, 255, 0), 2, cv2.LINE_AA)
                cv2.putText(image, f"Frames: {len(self.recording_frames)}/{self.recording_max_frames}", 
                            (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2, cv2.LINE_AA)
            
            # Draw hand landmarks on the image
            if results.multi_hand_landmarks:
                for hand_landmarks in results.multi_hand_landmarks:
                    # Draw the detailed hand landmarks
                    self.mp_drawing.draw_landmarks(
                        image, 
                        hand_landmarks, 
                        self.mp_hands.HAND_CONNECTIONS,
                        self.mp_drawing_styles.get_default_hand_landmarks_style(),
                        self.mp_drawing_styles.get_default_hand_connections_style()
                    )
                    
                    # Calculate finger features
                    finger_angles = self.calculate_finger_angles(hand_landmarks)
                    finger_distances = self.calculate_finger_distances(hand_landmarks)
                    
                    # If in recording mode, save frames
                    if self.recording_gesture and len(self.recording_frames) < self.recording_max_frames:
                        # Only record every 2 frames
                        if frame_count % 2 == 0:
                            self.recording_frames.append({
                                "angles": finger_angles,
                                "distances": finger_distances
                            })
                    
                    # Recognize gesture
                    gesture = self.recognize_gesture(finger_angles, finger_distances)
                    
                    # Apply smoothing unless in calibration/recording mode
                    if not self.calibration_mode and not self.recording_gesture:
                        gesture = self.smooth_gesture_prediction(gesture)
                    
                    # Display recognized gesture
                    if gesture != self.prev_gesture:
                        if not self.calibration_mode and not self.recording_gesture:
                            # Changed from DETECTED to GESTURE to match Java client expectations
                            self.send_to_client(f"GESTURE:{gesture}")
                        self.prev_gesture = gesture
                    
                    # Display current gesture
                    cv2.putText(image, gesture, (10, image.shape[0] - 20), cv2.FONT_HERSHEY_SIMPLEX, 
                                1, (0, 255, 0), 2, cv2.LINE_AA)
                    
                    # Show finger values for debugging
                    if self.calibration_mode:
                        # Display finger angles
                        for i, angle in enumerate(finger_angles):
                            cv2.putText(image, f"F{i+1}: {angle:.2f}", (image.shape[1] - 150, 30 + i*20), 
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 0, 0), 1, cv2.LINE_AA)
            
            # Display the image
            cv2.imshow('Hand Sign Recognizer', image)
            
            # Increment frame counter
            frame_count += 1
            
            if cv2.waitKey(5) & 0xFF == 27:  # ESC key
                break
        
        cap.release()
        cv2.destroyAllWindows()
    
    def stop(self):
        """Stop the recognizer"""
        self.running = False
        if self.client:
            self.client.close()
        self.server_socket.close()

if __name__ == "__main__":
    recognizer = HandSignRecognizer()
    recognizer.start_server()
    
    try:
        # Keep main thread alive
        while recognizer.running:
            time.sleep(1)
    except KeyboardInterrupt:
        recognizer.stop()