import javax.swing.*;
import javax.swing.event.DocumentEvent;
import javax.swing.event.DocumentListener;

import java.awt.*;
import java.awt.event.*;
import java.io.*;
import java.net.*;
import java.util.*;
import java.util.List;
import java.util.concurrent.*;

public class HandSignUI extends JFrame {
    // Connection & communication components
    private Socket socket;
    private BufferedReader reader;
    private PrintWriter writer;
    private Process pythonProcess;
    private boolean connected = false;
    private ExecutorService connectionExecutor = Executors.newSingleThreadExecutor();
    private int connectionAttempts = 0;
    private final int MAX_CONNECTION_ATTEMPTS = 10;
    
    // UI components
    private JLabel statusLabel;
    private JLabel gestureLabel;
    private JPanel gestureDisplayPanel;
    private JTextArea logArea;
    private JButton startButton;
    private JButton stopButton;
    private JComboBox<String> gestureComboBox;
    private JButton recordGestureButton;
    private JButton stopRecordingButton;
    private JButton deleteGestureButton;
    private JButton calibrateButton;
    private JPanel gestureStatsPanel;
    private Map<String, JLabel> gestureCounters = new HashMap<>();
    private Map<String, Integer> gestureCounts = new HashMap<>();
    private List<String> availableGestures = new ArrayList<>();
    
    // Configuration panel
    private JTextField pythonPathField;
    private JTextField scriptPathField;
    private JTextField portField;
    
    // Settings
    private static final String DEFAULT_SERVER_HOST = "localhost";
    private static final int DEFAULT_SERVER_PORT = 5000;
    private static final Color BACKGROUND_COLOR = new Color(245, 245, 250);
    private static final Color ACCENT_COLOR = new Color(70, 130, 180);
    
    // User configurable settings
    private String serverHost = DEFAULT_SERVER_HOST;
    private int serverPort = DEFAULT_SERVER_PORT;
    private String pythonExecutable = "python";  // Default, can be changed to python3
    private String scriptPath = "improved_hand_sign_recognizer.py";
    
    public HandSignUI() {
        setupUI();
        configureEventListeners();
    }
    
    private void setupUI() {
        // Basic frame setup
        setTitle("Advanced Hand Sign Recognizer");
        setSize(900, 650);
        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setLayout(new BorderLayout(10, 10));
        getContentPane().setBackground(BACKGROUND_COLOR);
        setLocationRelativeTo(null);
        
        // Main content panel with padding
        JPanel mainPanel = new JPanel(new BorderLayout(10, 10));
        mainPanel.setBorder(BorderFactory.createEmptyBorder(15, 15, 15, 15));
        mainPanel.setBackground(BACKGROUND_COLOR);
        
        // ===== TOP SECTION =====
        JPanel topPanel = new JPanel(new BorderLayout(10, 10));
        topPanel.setBackground(BACKGROUND_COLOR);
        
        // Status indicators - FIXED: Added proper padding and fixed layout
        JPanel statusPanel = new JPanel();
        statusPanel.setLayout(new BoxLayout(statusPanel, BoxLayout.X_AXIS));
        statusPanel.setBackground(BACKGROUND_COLOR);
        statusPanel.setBorder(BorderFactory.createEmptyBorder(5, 5, 10, 5));
        
        statusLabel = new JLabel("Status: Not Connected", JLabel.LEFT);
        statusLabel.setFont(new Font("Arial", Font.BOLD, 14));
        statusLabel.setForeground(Color.RED);
        statusLabel.setBorder(BorderFactory.createEmptyBorder(5, 5, 5, 5));
        
        // FIXED: Better layout for the connection panel
        JPanel connectionPanel = new JPanel();
        connectionPanel.setLayout(new BoxLayout(connectionPanel, BoxLayout.X_AXIS));
        connectionPanel.setBackground(BACKGROUND_COLOR);
        connectionPanel.add(statusLabel);
        connectionPanel.add(Box.createHorizontalGlue()); // Push everything else to the right
        
        // Control buttons panel
        JPanel controlPanel = new JPanel(new FlowLayout(FlowLayout.RIGHT));
        controlPanel.setBackground(BACKGROUND_COLOR);
        
        startButton = createStyledButton("Start Recognition", ACCENT_COLOR);
        stopButton = createStyledButton("Stop Recognition", new Color(220, 53, 69));
        stopButton.setEnabled(false);
        calibrateButton = createStyledButton("Calibrate", new Color(40, 167, 69));
        calibrateButton.setEnabled(false);
        
        controlPanel.add(startButton);
        controlPanel.add(stopButton);
        controlPanel.add(calibrateButton);
        
        // FIXED: Better layout for status and controls
        statusPanel.add(connectionPanel);
        statusPanel.add(Box.createHorizontalGlue());
        statusPanel.add(controlPanel);
        
        topPanel.add(statusPanel, BorderLayout.NORTH);
        
        // ===== GESTURE DISPLAY =====
        // FIXED: Improved gesture display panel with fixed height
        gestureDisplayPanel = new JPanel(new BorderLayout());
        gestureDisplayPanel.setBackground(Color.WHITE);
        gestureDisplayPanel.setBorder(
            BorderFactory.createCompoundBorder(
                BorderFactory.createEmptyBorder(10, 0, 10, 0),
                BorderFactory.createLineBorder(Color.LIGHT_GRAY, 1, true)
            )
        );
        gestureDisplayPanel.setPreferredSize(new Dimension(-1, 150)); // Fixed height
        
        gestureLabel = new JLabel("Waiting for gesture...", SwingConstants.CENTER);
        gestureLabel.setFont(new Font("Arial", Font.BOLD, 40));
        gestureLabel.setBorder(BorderFactory.createEmptyBorder(40, 10, 40, 10));
        gestureDisplayPanel.add(gestureLabel, BorderLayout.CENTER);

        // Wrap the gesture label in another panel to better control layout
        JPanel gestureLabelPanel = new JPanel(new GridBagLayout());
        gestureLabelPanel.setBackground(Color.WHITE);
        gestureLabelPanel.add(gestureLabel);
        
        gestureDisplayPanel.add(gestureLabelPanel, BorderLayout.CENTER);
        
        topPanel.add(gestureDisplayPanel, BorderLayout.CENTER);
        mainPanel.add(topPanel, BorderLayout.NORTH);
        
        // ===== CENTER SECTION =====
        JSplitPane splitPane = new JSplitPane(JSplitPane.HORIZONTAL_SPLIT);
        splitPane.setResizeWeight(0.6);
        splitPane.setBorder(null);
        
        // ===== LOG PANEL =====
        JPanel logPanel = new JPanel(new BorderLayout());
        logPanel.setBorder(BorderFactory.createTitledBorder(BorderFactory.createEtchedBorder(), "Log"));
        logPanel.setBackground(BACKGROUND_COLOR);
        
        logArea = new JTextArea();
        logArea.setEditable(false);
        logArea.setLineWrap(true);
        logArea.setWrapStyleWord(true);
        logArea.setFont(new Font("Monospaced", Font.PLAIN, 12));

         // Add a document listener to keep scroll at bottom for logs
        logArea.getDocument().addDocumentListener(new DocumentListener() {
            public void insertUpdate(DocumentEvent e) {
                SwingUtilities.invokeLater(() -> logArea.setCaretPosition(logArea.getDocument().getLength()));
            }
            public void removeUpdate(DocumentEvent e) {}
            public void changedUpdate(DocumentEvent e) {}
        });
        
        JScrollPane logScrollPane = new JScrollPane(logArea);
        logScrollPane.setBorder(BorderFactory.createEmptyBorder(5, 5, 5, 5));
        logPanel.add(logScrollPane, BorderLayout.CENTER);
        
        splitPane.setLeftComponent(logPanel);
        
        // ===== RIGHT PANEL =====
        JTabbedPane tabbedPane = new JTabbedPane();
        tabbedPane.setBackground(BACKGROUND_COLOR);
        
        // ===== GESTURE TRAINING PANEL =====
        JPanel gesturePanel = new JPanel(new BorderLayout());
        gesturePanel.setBackground(BACKGROUND_COLOR);
        
        // Gesture Training Section
        JPanel gestureTrainingPanel = new JPanel();
        gestureTrainingPanel.setLayout(new BoxLayout(gestureTrainingPanel, BoxLayout.Y_AXIS));
        gestureTrainingPanel.setBorder(BorderFactory.createTitledBorder(BorderFactory.createEtchedBorder(), "Gesture Training"));
        gestureTrainingPanel.setBackground(BACKGROUND_COLOR);
        
        // New gesture input
        JPanel newGesturePanel = new JPanel(new FlowLayout(FlowLayout.LEFT));
        newGesturePanel.setBackground(BACKGROUND_COLOR);
        JLabel newGestureLabel = new JLabel("New Gesture Name:");
        gestureComboBox = new JComboBox<>();
        gestureComboBox.setEditable(true);
        gestureComboBox.setPreferredSize(new Dimension(150, 25));
        
        newGesturePanel.add(newGestureLabel);
        newGesturePanel.add(gestureComboBox);
        gestureTrainingPanel.add(newGesturePanel);
        
        // Recording controls
        JPanel recordControlPanel = new JPanel(new FlowLayout(FlowLayout.LEFT));
        recordControlPanel.setBackground(BACKGROUND_COLOR);
        
        recordGestureButton = createStyledButton("Record Gesture", new Color(0, 123, 255));
        recordGestureButton.setEnabled(false);
        stopRecordingButton = createStyledButton("Stop Recording", new Color(220, 53, 69));
        stopRecordingButton.setEnabled(false);
        deleteGestureButton = createStyledButton("Delete Gesture", new Color(108, 117, 125));
        deleteGestureButton.setEnabled(false);
        
        recordControlPanel.add(recordGestureButton);
        recordControlPanel.add(stopRecordingButton);
        recordControlPanel.add(deleteGestureButton);
        
        gestureTrainingPanel.add(recordControlPanel);
        
        // FIXED: Improved gesture statistics panel with scroll functionality
        gestureStatsPanel = new JPanel();
        gestureStatsPanel.setLayout(new BoxLayout(gestureStatsPanel, BoxLayout.Y_AXIS));
        gestureStatsPanel.setBorder(BorderFactory.createTitledBorder(BorderFactory.createEtchedBorder(), "Gesture Statistics"));
        gestureStatsPanel.setBackground(BACKGROUND_COLOR);
        
        // Create a scroll pane for gesture stats to prevent overflow
        JScrollPane statsScrollPane = new JScrollPane(gestureStatsPanel);
        statsScrollPane.setBorder(BorderFactory.createEmptyBorder());
        statsScrollPane.setVerticalScrollBarPolicy(JScrollPane.VERTICAL_SCROLLBAR_AS_NEEDED);
        
        // Add default gestures to stats panel
        String[] defaultGestures = {"thumbs_up", "victory", "ok", "pointing", "five"};
        for (String gesture : defaultGestures) {
            addGestureToStats(gesture);
        }
        
        gesturePanel.add(gestureTrainingPanel, BorderLayout.NORTH);
        gesturePanel.add(statsScrollPane, BorderLayout.CENTER);
        
        // ===== CONFIGURATION PANEL =====
        JPanel configPanel = new JPanel();
        configPanel.setLayout(new BoxLayout(configPanel, BoxLayout.Y_AXIS));
        configPanel.setBackground(BACKGROUND_COLOR);
        configPanel.setBorder(BorderFactory.createEmptyBorder(10, 10, 10, 10));
        
        // Python Configuration
        JPanel pythonConfigPanel = new JPanel();
        pythonConfigPanel.setLayout(new BoxLayout(pythonConfigPanel, BoxLayout.Y_AXIS));
        pythonConfigPanel.setBorder(BorderFactory.createTitledBorder(BorderFactory.createEtchedBorder(), "Python Configuration"));
        pythonConfigPanel.setBackground(BACKGROUND_COLOR);
        
        // Python executable
        JPanel pythonExecPanel = new JPanel(new FlowLayout(FlowLayout.LEFT));
        pythonExecPanel.setBackground(BACKGROUND_COLOR);
        JLabel pythonExecLabel = new JLabel("Python Command:");
        pythonPathField = new JTextField(pythonExecutable, 15);
        pythonExecPanel.add(pythonExecLabel);
        pythonExecPanel.add(pythonPathField);
        pythonConfigPanel.add(pythonExecPanel);
        
        // Script path
        JPanel scriptPathPanel = new JPanel(new FlowLayout(FlowLayout.LEFT));
        scriptPathPanel.setBackground(BACKGROUND_COLOR);
        JLabel scriptPathLabel = new JLabel("Script Path:");
        scriptPathField = new JTextField(scriptPath, 20);
        JButton browseButton = new JButton("Browse...");
        scriptPathPanel.add(scriptPathLabel);
        scriptPathPanel.add(scriptPathField);
        scriptPathPanel.add(browseButton);
        pythonConfigPanel.add(scriptPathPanel);
        
        // Connection settings
        JPanel connectionConfigPanel = new JPanel();
        connectionConfigPanel.setLayout(new BoxLayout(connectionConfigPanel, BoxLayout.Y_AXIS));
        connectionConfigPanel.setBorder(BorderFactory.createTitledBorder(BorderFactory.createEtchedBorder(), "Connection Settings"));
        connectionConfigPanel.setBackground(BACKGROUND_COLOR);
        
        // Port setting
        JPanel portPanel = new JPanel(new FlowLayout(FlowLayout.LEFT));
        portPanel.setBackground(BACKGROUND_COLOR);
        JLabel portLabel = new JLabel("Port:");
        portField = new JTextField(String.valueOf(serverPort), 8);
        portPanel.add(portLabel);
        portPanel.add(portField);
        connectionConfigPanel.add(portPanel);
        
        // Save button
        JPanel savePanel = new JPanel(new FlowLayout(FlowLayout.RIGHT));
        savePanel.setBackground(BACKGROUND_COLOR);
        JButton saveConfigButton = createStyledButton("Save Configuration", new Color(40, 167, 69));
        savePanel.add(saveConfigButton);
        
        // Add all config sections
        configPanel.add(pythonConfigPanel);
        configPanel.add(Box.createRigidArea(new Dimension(0, 10)));
        configPanel.add(connectionConfigPanel);
        configPanel.add(Box.createRigidArea(new Dimension(0, 10)));
        configPanel.add(savePanel);
        
        // Add panels to tabs
        tabbedPane.addTab("Gesture Training", gesturePanel);
        tabbedPane.addTab("Configuration", configPanel);
        
        splitPane.setRightComponent(tabbedPane);
        
        mainPanel.add(splitPane, BorderLayout.CENTER);
        add(mainPanel);
        
        // Add action listeners for config panel
        browseButton.addActionListener(e -> browseForScript());
        saveConfigButton.addActionListener(e -> saveConfiguration());
    }
    
    private JButton createStyledButton(String text, Color bgColor) {
        JButton button = new JButton(text);
        button.setBackground(bgColor);
        button.setForeground(Color.WHITE);
        button.setFocusPainted(false);
        button.setBorderPainted(false);
        button.setFont(new Font("Arial", Font.BOLD, 12));
        button.setCursor(new Cursor(Cursor.HAND_CURSOR));
        
        button.addMouseListener(new MouseAdapter() {
            @Override
            public void mouseEntered(MouseEvent e) {
                button.setBackground(bgColor.darker());
            }
            
            @Override
            public void mouseExited(MouseEvent e) {
                button.setBackground(bgColor);
            }
        });
        
        return button;
    }
    
    private void configureEventListeners() {
        // Button listeners
        startButton.addActionListener(e -> startRecognition());
        stopButton.addActionListener(e -> stopRecognition());
        calibrateButton.addActionListener(e -> toggleCalibration());
        recordGestureButton.addActionListener(e -> startRecordingGesture());
        stopRecordingButton.addActionListener(e -> stopRecordingGesture());
        deleteGestureButton.addActionListener(e -> deleteGesture());
        
        // Handle window closing
        addWindowListener(new WindowAdapter() {
            @Override
            public void windowClosing(WindowEvent e) {
                stopRecognition();
                connectionExecutor.shutdown();
            }
        });
    }
    
    private void browseForScript() {
        JFileChooser fileChooser = new JFileChooser();
        fileChooser.setDialogTitle("Select Python Script");
        fileChooser.setFileFilter(new javax.swing.filechooser.FileFilter() {
            public boolean accept(File f) {
                return f.isDirectory() || f.getName().toLowerCase().endsWith(".py");
            }
            public String getDescription() {
                return "Python Files (*.py)";
            }
        });
        
        int result = fileChooser.showOpenDialog(this);
        if (result == JFileChooser.APPROVE_OPTION) {
            File selectedFile = fileChooser.getSelectedFile();
            scriptPathField.setText(selectedFile.getAbsolutePath());
        }
    }
    
    private void saveConfiguration() {
        try {
            // Save Python configuration
            pythonExecutable = pythonPathField.getText().trim();
            scriptPath = scriptPathField.getText().trim();
            
            // Save connection settings
            String portText = portField.getText().trim();
            try {
                serverPort = Integer.parseInt(portText);
            } catch (NumberFormatException e) {
                JOptionPane.showMessageDialog(this, 
                    "Invalid port number. Using default: " + DEFAULT_SERVER_PORT, 
                    "Configuration Error", 
                    JOptionPane.WARNING_MESSAGE);
                serverPort = DEFAULT_SERVER_PORT;
                portField.setText(String.valueOf(serverPort));
            }
            
            JOptionPane.showMessageDialog(this,
                "Configuration saved successfully!",
                "Configuration",
                JOptionPane.INFORMATION_MESSAGE);
                
            logArea.append("Configuration updated:\n");
            logArea.append("- Python: " + pythonExecutable + "\n");
            logArea.append("- Script: " + scriptPath + "\n");
            logArea.append("- Port: " + serverPort + "\n");
            
        } catch (Exception e) {
            JOptionPane.showMessageDialog(this,
                "Error saving configuration: " + e.getMessage(),
                "Configuration Error",
                JOptionPane.ERROR_MESSAGE);
        }
    }
    
    private void addGestureToStats(String gesture) {
        // FIXED: Improved gesture stats display
        JPanel gesturePanel = new JPanel(new BorderLayout());
        gesturePanel.setBackground(Color.WHITE);
        gesturePanel.setBorder(BorderFactory.createCompoundBorder(
            BorderFactory.createEmptyBorder(3, 3, 3, 3),
            BorderFactory.createLineBorder(Color.LIGHT_GRAY, 1, true)
        ));
        
        // Color coding based on gesture
        Color gestureColor = getGestureColor(gesture);
        JPanel colorBar = new JPanel();
        colorBar.setBackground(gestureColor);
        colorBar.setPreferredSize(new Dimension(10, 30));
        
        // Gesture info
        JPanel infoPanel = new JPanel(new BorderLayout());
        infoPanel.setBackground(Color.WHITE);
        infoPanel.setBorder(BorderFactory.createEmptyBorder(0, 5, 0, 0));
        
        JLabel nameLabel = new JLabel(gesture);
        nameLabel.setFont(new Font("Arial", Font.BOLD, 14));
        
        JLabel countLabel = new JLabel("Count: 0");
        countLabel.setFont(new Font("Arial", Font.PLAIN, 12));
        
        infoPanel.add(nameLabel, BorderLayout.NORTH);
        infoPanel.add(countLabel, BorderLayout.CENTER);
        
        gesturePanel.add(colorBar, BorderLayout.WEST);
        gesturePanel.add(infoPanel, BorderLayout.CENTER);
        
        gestureStatsPanel.add(gesturePanel);
        gestureStatsPanel.add(Box.createRigidArea(new Dimension(0, 5)));
        
        gestureCounters.put(gesture, countLabel);
        gestureCounts.put(gesture, 0);
        
        if (!availableGestures.contains(gesture)) {
            availableGestures.add(gesture);
            gestureComboBox.addItem(gesture);
        }
        
        gestureStatsPanel.revalidate();
        gestureStatsPanel.repaint();
    }
    
    private Color getGestureColor(String gesture) {
        switch (gesture.toLowerCase()) {
            case "thumbs_up": return new Color(40, 167, 69);
            case "victory": return new Color(0, 123, 255);
            case "ok": return new Color(255, 193, 7);
            case "pointing": return new Color(220, 53, 69);
            case "five": return new Color(111, 66, 193);
            default: return new Color(108, 117, 125);
        }
    }
    
    private void startRecognition() {
        // Disable start button immediately to prevent multiple clicks
        startButton.setEnabled(false);
        logArea.append("Starting Python hand sign recognizer...\n");
        
        // Check if the script exists
        File scriptFile = new File(scriptPath);
        if (!scriptFile.exists()) {
            logArea.append("ERROR: Script file not found: " + scriptPath + "\n");
            logArea.append("Looking for script in current directory...\n");
            
            // Try to find the script in the current directory
            File currentDir = new File(".");
            File[] pyFiles = currentDir.listFiles((dir, name) -> name.toLowerCase().endsWith(".py"));
            
            if (pyFiles != null && pyFiles.length > 0) {
                scriptPath = pyFiles[0].getPath();
                logArea.append("Found Python script: " + scriptPath + "\n");
                scriptPathField.setText(scriptPath);
            } else {
                logArea.append("No Python scripts found in current directory.\n");
                logArea.append("Please check the script path in the Configuration tab.\n");
                startButton.setEnabled(true);
                return;
            }
        }
        
        // Start the Python process in a separate thread to avoid UI freezing
        Thread pythonThread = new Thread(() -> {
            try {
                // Start the Python process
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
                        SwingUtilities.invokeLater(() -> {
                            if (connected) { // Only log if we haven't already stopped
                                logArea.append("Error reading Python output: " + e.getMessage() + "\n");
                            }
                        });
                    }
                }).start();
                
                // Connect to the server in a separate thread with retry logic
                connectionAttempts = 0;
                connectToServer();
                
            } catch (IOException e) {
                SwingUtilities.invokeLater(() -> {
                    logArea.append("Error launching Python: " + e.getMessage() + "\n");
                    logArea.append("Make sure Python is installed and the path is correct.\n");
                    startButton.setEnabled(true);
                });
            }
        });
        
        pythonThread.start();
    }
    
    private void connectToServer() {
        connectionExecutor.submit(() -> {
            connectionAttempts++;
            
            SwingUtilities.invokeLater(() -> {
                logArea.append("Connecting to server (attempt " + connectionAttempts + ")...\n");
                statusLabel.setText("Status: Connecting...");
                statusLabel.setForeground(new Color(255, 165, 0)); // Orange for connecting
            });
            
            try {
                // Short delay before connection attempt
                Thread.sleep(1000);
                
                // Create socket connection with timeout
                socket = new Socket();
                socket.connect(new InetSocketAddress(serverHost, serverPort), 2000);
                reader = new BufferedReader(new InputStreamReader(socket.getInputStream()));
                writer = new PrintWriter(socket.getOutputStream(), true);
                
                connected = true;
                
                SwingUtilities.invokeLater(() -> {
                    statusLabel.setText("Status: Connected");
                    statusLabel.setForeground(new Color(40, 167, 69)); // Green for connected
                    stopButton.setEnabled(true);
                    calibrateButton.setEnabled(true);
                    recordGestureButton.setEnabled(true);
                    deleteGestureButton.setEnabled(true);
                    
                    logArea.append("Successfully connected to server\n");
                });
                
                // Request the list of available gestures
                requestGestureList();
                
                // Start reading messages from the server
                readMessages();
            } catch (IOException e) {
                SwingUtilities.invokeLater(() -> {
                    logArea.append("Connection failed: " + e.getMessage() + "\n");
                    
                    if (connectionAttempts < MAX_CONNECTION_ATTEMPTS) {
                        logArea.append("Retrying in 2 seconds...\n");
                        // Schedule another attempt
                        try {
                            Thread.sleep(1000);
                            connectToServer();
                        } catch (InterruptedException ie) {
                            Thread.currentThread().interrupt();
                        }
                    } else {
                        logArea.append("Maximum connection attempts reached. Please check if:\n");
                        logArea.append("1. The Python script is running correctly\n");
                        logArea.append("2. The port number (" + serverPort + ") is correct\n");
                        logArea.append("3. No firewall is blocking the connection\n");
                        logArea.append("You can try again by clicking 'Start Recognition'\n");
                        
                        // Clean up
                        stopPythonProcess();
                        startButton.setEnabled(true);
                    }
                });
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
    }
    
    private void stopRecognition() {
        connected = false;
        connectionAttempts = MAX_CONNECTION_ATTEMPTS; // Prevent further automatic connection attempts
        
        // Close socket connection using try-with-resources for better resource management
        if (socket != null) {
            try (Socket closeSocket = socket;
                 BufferedReader closeReader = reader;
                 PrintWriter closeWriter = writer) {
                // Resources will be automatically closed
            } catch (IOException e) {
                logArea.append("Error closing connection: " + e.getMessage() + "\n");
            } finally {
                socket = null;
                reader = null;
                writer = null;
            }
        }
        
        stopPythonProcess();
        
        // Update UI
        statusLabel.setText("Status: Not Connected");
        statusLabel.setForeground(Color.RED);
        gestureLabel.setText("Waiting for gesture...");
        gestureLabel.setForeground(Color.BLACK);
        gestureDisplayPanel.setBackground(Color.WHITE);
        
        startButton.setEnabled(true);
        stopButton.setEnabled(false);
        calibrateButton.setEnabled(false);
        recordGestureButton.setEnabled(false);
        stopRecordingButton.setEnabled(false);
        deleteGestureButton.setEnabled(false);
    }
    
    private void stopPythonProcess() {
        if (pythonProcess != null) {
            pythonProcess.destroy();
            try {
                if (pythonProcess.waitFor(5, java.util.concurrent.TimeUnit.SECONDS)) {
                    logArea.append("Python process stopped normally\n");
                } else {
                    logArea.append("Python process timed out, forcing termination\n");
                    pythonProcess.destroyForcibly();
                }
                pythonProcess = null;
            } catch (InterruptedException e) {
                logArea.append("Error stopping Python process: " + e.getMessage() + "\n");
                Thread.currentThread().interrupt();
            }
        }
    }
    
    private void toggleCalibration() {
        if (connected && writer != null) {
            if (calibrateButton.getText().equals("Calibrate")) {
                writer.println("CALIBRATE:START");
                calibrateButton.setText("Stop Calibration");
                calibrateButton.setBackground(new Color(220, 53, 69));
                logArea.append("Started calibration mode\n");
            } else {
                writer.println("STOP_CALIBRATE");
                calibrateButton.setText("Calibrate");
                calibrateButton.setBackground(new Color(40, 167, 69));
                logArea.append("Stopped calibration mode\n");
            }
        }
    }
    
    private void startRecordingGesture() {
        if (connected && writer != null) {
            String gestureName = (String) gestureComboBox.getSelectedItem();
            if (gestureName == null || gestureName.trim().isEmpty()) {
                JOptionPane.showMessageDialog(this, 
                    "Please enter a gesture name", 
                    "Input Required", 
                    JOptionPane.WARNING_MESSAGE);
                return;
            }
            
            gestureName = gestureName.trim().replaceAll("\\s+", "_").toLowerCase();
            writer.println("RECORD:" + gestureName);
            logArea.append("Recording gesture: " + gestureName + "\n");
            
            recordGestureButton.setEnabled(false);
            stopRecordingButton.setEnabled(true);
            calibrateButton.setEnabled(false);
            deleteGestureButton.setEnabled(false);
            
            // Update UI to show recording state
            gestureLabel.setText("RECORDING: " + gestureName);
            gestureLabel.setForeground(Color.WHITE);
            gestureDisplayPanel.setBackground(new Color(220, 53, 69));
        }
    }
    
    private void stopRecordingGesture() {
        if (connected && writer != null) {
            writer.println("STOP_RECORD");
            logArea.append("Stopped recording gesture\n");
            
            recordGestureButton.setEnabled(true);
            stopRecordingButton.setEnabled(false);
            calibrateButton.setEnabled(true);
            deleteGestureButton.setEnabled(true);
            
            // Reset UI
            gestureLabel.setText("Waiting for gesture...");
            gestureLabel.setForeground(Color.BLACK);
            gestureDisplayPanel.setBackground(Color.WHITE);
        }
    }
    
    private void deleteGesture() {
        if (connected && writer != null) {
            String gestureName = (String) gestureComboBox.getSelectedItem();
            if (gestureName == null || gestureName.trim().isEmpty()) {
                JOptionPane.showMessageDialog(this, 
                    "Please select a gesture to delete", 
                    "Selection Required", 
                    JOptionPane.WARNING_MESSAGE);
                return;
            }
            
            int confirm = JOptionPane.showConfirmDialog(this,
                "Are you sure you want to delete the gesture '" + gestureName + "'?",
                "Confirm Deletion",
                JOptionPane.YES_NO_OPTION);
                
            if (confirm == JOptionPane.YES_OPTION) {
                writer.println("DELETE_GESTURE:" + gestureName);
                logArea.append("Deleting gesture: " + gestureName + "\n");
            }
        }
    }
    
    private void readMessages() {
        if (reader == null) return;
        
        new Thread(() -> {
            try {
                String message;
                while (connected && (message = reader.readLine()) != null) {
                    final String receivedMessage = message;
                    SwingUtilities.invokeLater(() -> processMessage(receivedMessage));
                }
            } catch (IOException e) {
                if (connected) { // Only log error if we haven't manually disconnected
                    SwingUtilities.invokeLater(() -> {
                        logArea.append("Connection error: " + e.getMessage() + "\n");
                        stopRecognition(); // Auto-disconnect on error
                    });
                }
            }
        }).start();
    }
    
    private void processMessage(String message) {
        logArea.append("Received: " + message + "\n");
        
        if (message.startsWith("GESTURE:")) {
            // Handle detected gesture
            String gestureName = message.substring(8).trim();
            updateDetectedGesture(gestureName);
        } else if (message.startsWith("GESTURES_LIST:")) {
            // Handle list of available gestures
            processGestureList(message.substring(14).trim());
        } else if (message.startsWith("RECORD_SUCCESS:")) {
            // Handle successful recording
            String gestureName = message.substring(15).trim();
            logArea.append("Successfully recorded gesture: " + gestureName + "\n");
            
            // Add the gesture to stats if it's not already there
            if (!gestureCounts.containsKey(gestureName)) {
                addGestureToStats(gestureName);
            }
        } else if (message.startsWith("RECORD_ERROR:")) {
            // Handle recording error
            String error = message.substring(13).trim();
            logArea.append("Error recording gesture: " + error + "\n");
            JOptionPane.showMessageDialog(this, 
                "Error recording gesture: " + error, 
                "Recording Error", 
                JOptionPane.ERROR_MESSAGE);
        } else if (message.startsWith("DELETE_SUCCESS:")) {
            // Handle successful deletion
            String gestureName = message.substring(15).trim();
            logArea.append("Successfully deleted gesture: " + gestureName + "\n");
            removeGestureFromStats(gestureName);
        } else if (message.startsWith("DELETE_ERROR:")) {
            // Handle deletion error
            String error = message.substring(13).trim();
            logArea.append("Error deleting gesture: " + error + "\n");
            JOptionPane.showMessageDialog(this, 
                "Error deleting gesture: " + error, 
                "Deletion Error", 
                JOptionPane.ERROR_MESSAGE);
        } else if (message.startsWith("CALIBRATION_COMPLETE")) {
            // Handle calibration completion
            logArea.append("Calibration completed successfully\n");
            calibrateButton.setText("Calibrate");
            calibrateButton.setBackground(new Color(40, 167, 69));
        } else if (message.startsWith("CALIBRATION_ERROR:")) {
            // Handle calibration error
            String error = message.substring(18).trim();
            logArea.append("Calibration error: " + error + "\n");
            calibrateButton.setText("Calibrate");
            calibrateButton.setBackground(new Color(40, 167, 69));
        }
    }
    
    private void updateDetectedGesture(String gestureName) {
        // Update the gesture display
        gestureLabel.setText(gestureName);
        gestureDisplayPanel.setBackground(Color.WHITE);
        
        // Update the counter for this gesture
        if (gestureCounts.containsKey(gestureName)) {
            int count = gestureCounts.get(gestureName) + 1;
            gestureCounts.put(gestureName, count);
            
            // Update the counter label
            JLabel countLabel = gestureCounters.get(gestureName);
            if (countLabel != null) {
                countLabel.setText("Count: " + count);
            }
        }
        
        // Change the color of the display panel based on the gesture
        Color gestureColor = getGestureColor(gestureName);
        gestureDisplayPanel.setBackground(new Color(gestureColor.getRed(), 
                                                  gestureColor.getGreen(), 
                                                  gestureColor.getBlue(), 
                                                  50)); // Semi-transparent
    }
    
    private void processGestureList(String gestureListStr) {
        // Process comma-separated list of gestures
        String[] gestures = gestureListStr.split(",");
        
        // Clear previous gestures
        availableGestures.clear();
        gestureComboBox.removeAllItems();
        
        // Clear gesture stats panel
        gestureStatsPanel.removeAll();
        gestureCounters.clear();
        gestureCounts.clear();
        
        // Add each gesture to UI
        for (String gesture : gestures) {
            gesture = gesture.trim();
            if (!gesture.isEmpty()) {
                availableGestures.add(gesture);
                gestureComboBox.addItem(gesture);
                addGestureToStats(gesture);
            }
        }
        
        gestureStatsPanel.revalidate();
        gestureStatsPanel.repaint();
        
        logArea.append("Updated gesture list: " + gestureListStr + "\n");
    }
    
    private void requestGestureList() {
        if (connected && writer != null) {
            writer.println("GET_GESTURES");
        }
    }
    
    private void removeGestureFromStats(String gestureName) {
        // Remove from combo box if present
        for (int i = 0; i < gestureComboBox.getItemCount(); i++) {
            if (gestureComboBox.getItemAt(i).equals(gestureName)) {
                gestureComboBox.removeItemAt(i);
                break;
            }
        }
        
        // Remove from available gestures list
        availableGestures.remove(gestureName);
        
        // Remove from counters
        gestureCounters.remove(gestureName);
        gestureCounts.remove(gestureName);
        
        // Rebuild the stats panel
        gestureStatsPanel.removeAll();
        
        for (String gesture : availableGestures) {
            addGestureToStats(gesture);
        }
        
        gestureStatsPanel.revalidate();
        gestureStatsPanel.repaint();
    }
    
    // Main method to start the application
    public static void main(String[] args) {
        // Use system look and feel
        try {
            UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName());
        } catch (Exception e) {
            e.printStackTrace();
        }
        
        // Start UI on EDT
        SwingUtilities.invokeLater(() -> {
            HandSignUI ui = new HandSignUI();
            ui.setVisible(true);
            ui.logArea.append("Hand Sign Recognizer UI started\n");
            ui.logArea.append("Configure settings in the Configuration tab\n");
            ui.logArea.append("Click 'Start Recognition' to begin\n");
        });
    }
}