# XYPH TUI Dashboard Demo
# Recorded with github.com/charmbracelet/vhs

Output demo.gif

Set Shell zsh
Set FontSize 14
Set Width 1400
Set Height 800
Set Padding 16
Set Theme { "name": "XYPH", "black": "#0b0f14", "red": "#ff6b6b", "green": "#69db7c", "yellow": "#ffd43b", "blue": "#74c0fc", "magenta": "#da77f2", "cyan": "#66d9ef", "white": "#e6edf3", "brightBlack": "#495057", "brightRed": "#ff8787", "brightGreen": "#8ce99a", "brightYellow": "#ffe066", "brightBlue": "#a5d8ff", "brightMagenta": "#e599f7", "brightCyan": "#99e9f2", "brightWhite": "#f8f9fa", "background": "#0b0f14", "foreground": "#e6edf3", "selectionBackground": "#264f78", "cursorColor": "#66d9ef" }
Set TypingSpeed 0ms

# Launch the dashboard
Type "XYPH_AGENT_ID=human.james ./xyph-dashboard.tsx"
Enter
Sleep 3s

# Landing screen — pause to admire
Sleep 3s

# Dismiss landing → roadmap view
Type " "
Sleep 2s

# Navigate down through quests
Down
Sleep 500ms
Down
Sleep 500ms
Down
Sleep 500ms
Down
Sleep 500ms

# Fold/unfold a campaign
Type " "
Sleep 2s

# Unfold it again
Type " "
Sleep 2s

# Navigate to a quest and open detail
Down
Sleep 500ms
Down
Sleep 500ms
Type " "
Sleep 3s

# Close detail modal
Escape
Sleep 1s

# Switch to lineage view
Tab
Sleep 2s

# Navigate lineage
Down
Sleep 500ms
Down
Sleep 500ms
Down
Sleep 500ms

# Switch to all nodes view
Tab
Sleep 2s

# Navigate all nodes
Down
Sleep 500ms
Down
Sleep 500ms
Down
Sleep 500ms

# Switch to inbox view
Tab
Sleep 2s

# Navigate inbox
Down
Sleep 500ms
Down
Sleep 500ms

# Open help modal
Type "?"
Sleep 3s

# Close help
Escape
Sleep 1s

# Quit
Type "q"
Sleep 1s
