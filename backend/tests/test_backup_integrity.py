import hashlib
import json
import sqlite3
import zipfile

import pytest
from fastapi import HTTPException

from routers.workspace import _extract_validated_backup


def _database(path):
    connection = sqlite3.connect(path)
    connection.execute("CREATE TABLE papers (id TEXT PRIMARY KEY)")
    connection.execute("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT)")
    connection.commit()
    connection.close()


def _archive(path, database, checksum):
    with zipfile.ZipFile(path, "w") as bundle:
        bundle.write(database, "database/researchmind.db")
        bundle.writestr("manifest.json", json.dumps({"version": 2, "database_sha256": checksum}))


def test_validated_backup_checks_checksum_and_sqlite(tmp_path):
    database = tmp_path / "source.db"
    archive = tmp_path / "backup.zip"
    pending = tmp_path / "pending.db"
    _database(database)
    checksum = hashlib.sha256(database.read_bytes()).hexdigest()
    _archive(archive, database, checksum)

    manifest = _extract_validated_backup(archive, pending)

    assert manifest["version"] == 2
    assert pending.is_file()


def test_validated_backup_rejects_checksum_mismatch(tmp_path):
    database = tmp_path / "source.db"
    archive = tmp_path / "backup.zip"
    _database(database)
    _archive(archive, database, "0" * 64)

    with pytest.raises(HTTPException, match="checksum"):
        _extract_validated_backup(archive, tmp_path / "pending.db")
