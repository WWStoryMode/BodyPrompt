FROM python:3.12-slim

WORKDIR /workspace/service
COPY service/pyproject.toml .
COPY service/app app
COPY fixtures /workspace/fixtures
RUN pip install --no-cache-dir .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
