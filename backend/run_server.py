import asyncio
import selectors
import sys
import uvicorn


async def run_app() -> None:
    config = uvicorn.Config(
        "app.main:app",
        host="127.0.0.1",
        port=8000,
        loop="none",
        log_level="info",
    )
    server = uvicorn.Server(config)
    await server.serve()


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.run(run_app(), loop_factory=lambda: asyncio.SelectorEventLoop(selectors.SelectSelector()))
    else:
        asyncio.run(run_app())
