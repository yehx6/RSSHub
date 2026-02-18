param(
    [string]$SkillPath = "D:\github\RSSHub\skills\rsshub-route-rebuild"
)

$CondaEnv = "D:\conda_python_env\minimind"
$Validator = "C:\Users\yehongxin\.codex\skills\.system\skill-creator\scripts\quick_validate.py"

conda run -p $CondaEnv python $Validator $SkillPath
