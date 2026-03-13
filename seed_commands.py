"""Seed the DB with random commands for testing."""

import random
import time

import httpx

API_URL = "http://localhost:8000"
TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJjM2FiNzk5Zi02NGVhLTQ2ZTctODA0My05ZjU0NWE5NWNiMGYiLCJleHAiOjE3NzI4MDUwMTB9.ETfNpf9HuQejdJIn1-Tdmiz0GOuYo-l2RcIZthdWisU"  # paste your token here  # noqa: E501, S105
DEVICE_ID = "689e2d1d"
ATTRIBUTE = "temperature_setpoint"
MIN_VALUE = 17
MAX_VALUE = 30
COUNT = 8

client = httpx.Client(
    base_url=API_URL,
    headers={"Authorization": f"Bearer {TOKEN}"},
)

for i in range(COUNT):
    value = random.randint(MIN_VALUE, MAX_VALUE)  # noqa: S311
    r = client.post(
        f"/devices/{DEVICE_ID}/{ATTRIBUTE}",
        json={"value": value},
    )
    print(f"[{i + 1}/{COUNT}] {value} -> {r.status_code}")  # noqa: T201
    time.sleep(1)
