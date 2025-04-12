// HandSignUI.java
import javax.swing.*;
import java.awt.*;
import java.awt.event.*;
import java.io.*;
import java.net.*;

public class HandSignUI extends JFrame {
    private JLabel statusLabel;
    private JLabel gestureLabel;
    private JButton startButton;
    private JButton stopButton;
    private JTextArea logArea;
    private Socket socket;
    private BufferedReader reader;
    private static final String SERVER_HOST = "localhost";
    private static final int SERVER_PORT = 5000;
    private boolean connected = false;
    private Process pythonProcess;
    
    public HandSignUI() {
        // Set up the JFrame
        setTitle("Hand Sign Recognizer");
        setSize(500, 400);
        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setLayout(new BorderLayout());
        
        // Create UI components
        JPanel topPanel = new JPanel(new BorderLayout());
        
        // Status panel
        JPanel statusPanel = new JPanel(new GridLayout(2, 1));
        statusLabel = new JLabel("Status: Not Connected");
        gestureLabel = new JLabel("Gesture: None", SwingConstants.CENTER);
        gestureLabel.setFont(new Font("Arial", Font.BOLD, 24));
        statusPanel.add(statusLabel);
        statusPanel.add(gestureLabel);
        topPanel.add(statusPanel, BorderLayout.CENTER);
        
        // Button panel
        JPanel buttonPanel = new JPanel();
        startButton = new JButton("Start Recognition");
        stopButton = new JButton("Stop Recognition");
        stopButton.setEnabled(false);
        
        buttonPanel.add(startButton);
        buttonPanel.add(stopButton);
        topPanel.add(buttonPanel, BorderLayout.SOUTH);
        
        // Log area
        logArea = new JTextArea();
        logArea.setEditable(false);
        JScrollPane scrollPane = new JScrollPane(logArea);
        
        // Add components to the frame
        add(topPanel, BorderLayout.NORTH);
        add(scrollPane, BorderLayout.CENTER);
        
        // Set up event listeners
        startButton.addActionListener(e -> startRecognition());
        stopButton.addActionListener(e -> stopRecognition());
        
        // Handle window closing
        addWindowListener(new WindowAdapter() {
            @Override
            public void windowClosing(WindowEvent e) {
                stopRecognition();
            }
        });
    }
    
    private void startRecognition() {
        try {
            // Start the Python script if it's not already running
            logArea.append("Starting Python hand sign recognizer...\n");
            
            // Start the Python process
            String pythonExecutable = "python";  // Use "python3" on some systems
            String scriptPath = "hand_sign_recognizer.py";
            
            ProcessBuilder processBuilder = new ProcessBuilder(pythonExecutable, scriptPath);
            processBuilder.redirectErrorStream(true);
            pythonProcess = processBuilder.start();
            
            // Read process output in a separate thread
            new Thread(() -> {
                try (BufferedReader processReader = new BufferedReader(
                        new InputStreamReader(pythonProcess.getInputStream()))) {
                    String line;
                    while ((line = processReader.readLine()) != null) {
                        final String logLine = line;
                        SwingUtilities.invokeLater(() -> logArea.append("[Python] " + logLine + "\n"));
                    }
                } catch (IOException e) {
                    SwingUtilities.invokeLater(() -> logArea.append("Error reading Python output: " + e.getMessage() + "\n"));
                }
            }).start();
            
            // Wait a moment for the server to start
            Thread.sleep(2000);
            
            // Connect to the Python server
            logArea.append("Connecting to server...\n");
            socket = new Socket(SERVER_HOST, SERVER_PORT);
            reader = new BufferedReader(new InputStreamReader(socket.getInputStream()));
            
            connected = true;
            statusLabel.setText("Status: Connected");
            startButton.setEnabled(false);
            stopButton.setEnabled(true);
            
            // Start reading messages from the server
            new Thread(this::readMessages).start();
            
        } catch (IOException | InterruptedException e) {
            logArea.append("Error: " + e.getMessage() + "\n");
            stopRecognition();
        }
    }
    
    private void readMessages() {
        try {
            String line;
            while (connected && (line = reader.readLine()) != null) {
                final String gesture = line.trim();
                
                SwingUtilities.invokeLater(() -> {
                    gestureLabel.setText("Gesture: " + gesture);
                    logArea.append("Recognized: " + gesture + "\n");
                    
                    // Change color based on gesture
                    if ("thumbs_up".equals(gesture)) {
                        gestureLabel.setForeground(Color.GREEN);
                    } else if ("victory".equals(gesture)) {
                        gestureLabel.setForeground(Color.BLUE);
                    } else if ("ok".equals(gesture)) {
                        gestureLabel.setForeground(Color.ORANGE);
                    } else if ("pointing".equals(gesture)) {
                        gestureLabel.setForeground(Color.RED);
                    } else if ("five".equals(gesture)) {
                        gestureLabel.setForeground(Color.MAGENTA);
                    } else {
                        gestureLabel.setForeground(Color.BLACK);
                    }
                });
            }
        } catch (IOException e) {
            if (connected) {
                SwingUtilities.invokeLater(() -> {
                    logArea.append("Connection error: " + e.getMessage() + "\n");
                    stopRecognition();
                });
            }
        }
    }
    
    private void stopRecognition() {
        connected = false;
        
        // Close socket connection
        try {
            if (reader != null) reader.close();
            if (socket != null) socket.close();
        } catch (IOException e) {
            logArea.append("Error closing connection: " + e.getMessage() + "\n");
        }
        
        // Stop Python process
        if (pythonProcess != null) {
            pythonProcess.destroy();
            try {
                // Wait for the process to be terminated
                if (pythonProcess.waitFor(5, java.util.concurrent.TimeUnit.SECONDS)) {
                    logArea.append("Python process stopped normally\n");
                } else {
                    logArea.append("Python process timed out, forcing termination\n");
                    pythonProcess.destroyForcibly();
                }
            } catch (InterruptedException e) {
                logArea.append("Error stopping Python process: " + e.getMessage() + "\n");
            }
        }
        
        // Update UI
        statusLabel.setText("Status: Not Connected");
        gestureLabel.setText("Gesture: None");
        gestureLabel.setForeground(Color.BLACK);
        startButton.setEnabled(true);
        stopButton.setEnabled(false);
    }
    
    public static void main(String[] args) {
        // Use the system look and feel
        try {
            UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName());
        } catch (Exception e) {
            e.printStackTrace();
        }
        
        // Create and show the UI
        SwingUtilities.invokeLater(() -> {
            HandSignUI ui = new HandSignUI();
            ui.setVisible(true);
        });
    }
}