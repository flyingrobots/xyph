Output title-screen.gif
Set Shell zsh
Set Width 1200
Set Height 600
Set FontSize 14
Set Padding 20
Set Theme "Catppuccin Mocha"
Set TypingSpeed 0
Set Framerate 30

# Launch and wait for load + hitch to pass
Hide
Type "XYPH_AGENT_ID=human.james npx tsx xyph-dashboard.tsx"
Enter
Sleep 6s
Show

# Capture exactly one pulse cycle (3s)
Sleep 3s

Hide
Type "q"
Sleep 500ms
