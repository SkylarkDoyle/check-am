# syntax=docker/dockerfile:1
# CheckAm ETL + migrations image. Build context: repository root (needs etl/ and db/).
#   docker compose run --rm etl run --source food_db
#   docker compose run --rm etl run --source food_db --target neon
# The `migrate` compose service reuses this image to run Alembic from /app/db.

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    ETL_RAW_CACHE_DIR=/data/raw_cache
WORKDIR /app

# Dependencies first (cached until etl/pyproject.toml changes). Chromium + its OS libs
# are installed with the same playwright version pip resolved, so they always match.
COPY etl/pyproject.toml etl/pyproject.toml
RUN python -c "import tomllib; print('\n'.join(tomllib.load(open('etl/pyproject.toml','rb'))['project']['dependencies']))" > /tmp/requirements.txt \
 && pip install -r /tmp/requirements.txt \
 && playwright install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/* /tmp/requirements.txt

COPY etl/src etl/src
COPY etl/config etl/config
COPY db db
# Editable install keeps etl/config/portals.yaml where the code expects it.
RUN pip install --no-deps -e ./etl

RUN groupadd --system --gid 10001 etl && useradd --system --uid 10001 --gid etl --create-home etl \
 && mkdir -p /data/raw_cache /data/logs && chown -R etl:etl /data
USER etl
WORKDIR /data
VOLUME ["/data"]

ENTRYPOINT ["python", "-m", "checkam_etl.cli"]
CMD ["--help"]
