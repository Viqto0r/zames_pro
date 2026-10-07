# VHS demo script for the zames README (BACKLOG E2).
# Render with:  vhs docs/demo.tape
# Output:      docs/demo.gif
#
# VHS replays this script instead of recording a live session, so the demo
# is deterministic and reproducible -- run it again and the GIF is identical.

Output docs/demo.gif

Set FontSize 16
Set Width 1000
Set Height 640
Set Theme "Dracula"
Set Padding 20
Set Margin 0
Set MarginFill "#1d1f21"

Sleep 500ms

# 1. Start the agent in a project directory.
Type "cd zames_pro"
Sleep 500ms
Enter
Sleep 500ms
Type "zames"
Sleep 500ms
Enter

# 2. Give it a small read-only task.
Sleep 3s
Type "посмотри версию в package.json"
Sleep 500ms
Enter

Sleep 14s

# 3. Exit.
Type "/exit"
Sleep 500ms

Sleep 2s
