from datetime import date

from checkam_etl.sources.alerts_pdf import parse_alert_ref, parse_issued_date


def test_parse_alert_ref() -> None:
    assert parse_alert_ref("Public Alert No. 042/2026-Alert on Seizure") == "Alert No. 042/2026"
    assert parse_alert_ref("Public Alert No: 31/2026- Recall") == "Alert No. 031/2026"
    assert parse_alert_ref("Public Alert No. 0028/2018 - Recall") == "Alert No. 028/2018"
    assert parse_alert_ref("No alert here") is None


def test_parse_issued_date() -> None:
    assert parse_issued_date("August 19, 2026") == date(2026, 8, 19)
    assert parse_issued_date("19/12/2024") == date(2024, 12, 19)
    assert parse_issued_date("2026-05-10") == date(2026, 5, 10)
    assert parse_issued_date("Invalid date text") is None
