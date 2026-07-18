"""OS credential-store access for user-provided provider keys."""

SERVICE_NAME = "ResearchMind VN"


class SecretStorageError(RuntimeError):
    pass


def get_secret(name: str) -> str:
    try:
        import keyring
        return keyring.get_password(SERVICE_NAME, name) or ""
    except Exception as exc:
        raise SecretStorageError("The operating-system credential store is unavailable.") from exc


def set_secret(name: str, value: str) -> None:
    try:
        import keyring
        if value:
            keyring.set_password(SERVICE_NAME, name, value)
        else:
            try:
                keyring.delete_password(SERVICE_NAME, name)
            except keyring.errors.PasswordDeleteError:
                pass
    except Exception as exc:
        raise SecretStorageError("The operating-system credential store is unavailable.") from exc
