import json
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path


@dataclass
class RunReport:
    source: str
    started: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    finished: str = ""
    fetched: int = 0
    parsed: int = 0
    inserted: int = 0
    updated: int = 0
    rejected: int = 0
    skipped_category: int = 0
    rejected_corrupt_reg: int = 0  # month-style numbers such as "Aug-67" (subset of rejected)
    duplicates_collapsed: int = 0  # extra source rows for the same reg number + product name
    shared_reg_numbers: int = 0  # reg numbers carrying several distinct products (all kept)
    pruned: int = 0  # rows of this source not seen in a complete --prune run (deleted)
    images_set: int = 0
    errors: list[str] = field(default_factory=list)

    def complete(self) -> None:
        self.finished = datetime.now(UTC).isoformat()

    def to_dict(self) -> dict[str, object]:
        return asdict(self)

    def to_json(self) -> str:
        return json.dumps(self.to_dict())

    def print_and_save(self, log_dir: str = "./logs") -> None:
        if not self.finished:
            self.complete()
        line = self.to_json()
        print(line)

        log_path = Path(log_dir)
        log_path.mkdir(parents=True, exist_ok=True)
        log_file = log_path / f"{self.source}_runs.log"
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(line + "\n")
