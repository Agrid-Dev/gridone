# Gridone API server

A http server running the `gridone-api` package.

## Development

To run in development, add a `.env` file with environment variables (`DB_PATH`).

```sh
fastapi dev main.py
# or
uvicorn main:app --reload --reload-dir ../../packages/api # to reload when updating the api package

curl localhost:8000/devices | jq
```
