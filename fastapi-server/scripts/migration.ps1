Param(
    [string]$n
)

Set-Location ..
.\.venv\Scripts\Activate.ps1
# Set-Location app/
alembic revision --autogenerate -m "$n"
alembic upgrade head