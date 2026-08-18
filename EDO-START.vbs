Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
root = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = root

' Find Node.js using its normal installation path first, then PATH.
nodeExe = fso.BuildPath(shell.ExpandEnvironmentStrings("%ProgramFiles%"), "nodejs\node.exe")
If Not fso.FileExists(nodeExe) Then nodeExe = fso.BuildPath(shell.ExpandEnvironmentStrings("%ProgramFiles(x86)%"), "nodejs\node.exe")
If Not fso.FileExists(nodeExe) Then nodeExe = "node.exe"

shell.Run Chr(34) & nodeExe & Chr(34) & " " & Chr(34) & fso.BuildPath(root, "launcher.cjs") & Chr(34), 0, False
Set shell = Nothing
Set fso = Nothing
