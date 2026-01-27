import requests

url = "http://127.0.0.1:8000/ping"

response = requests.post(url)

print(response.status_code)
print(response.json())
