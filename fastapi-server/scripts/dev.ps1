Set-Location ..
.\.venv\Scripts\Activate.ps1

# if [ ! -d ".venv" ]; then
#   python -m venv .venv
# fi

# source ./.venv/bin/activate.ps1
# cd api

# NEW_DEPS=false

# while [ ! $# -eq 0 ]; do
#     case "$1" in 
#         --new-deps)
#             NEW_DEPS=true
#             ;;
#     esac
#     shift
# done

# if [ "$NEW_DEPS" = true ]; then
#     pip-compile requirements.in
# fi

# pip install -r requirements.txt
# Set-Location ..
Set-Location app
fastapi run app/main.py