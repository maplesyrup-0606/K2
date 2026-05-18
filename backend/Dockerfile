FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

COPY . .

ENV FLASK_APP=app.py

EXPOSE 5000

CMD ["sh", "-c", "flask db upgrade && gunicorn -w 4 -b 0.0.0.0:5000 app:app"]
