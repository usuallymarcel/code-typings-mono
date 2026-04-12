from pydantic_settings import BaseSettings, SettingsConfigDict

class Env(BaseSettings):
    database_url: str

    model_config = SettingsConfigDict(
        env_file='.env',
        case_sensitive=False,
        extra='ignore'
    )

env = Env()