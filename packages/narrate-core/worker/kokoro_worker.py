import json
import os
import re
import socket
import sys
import threading
import time

import numpy as np
import soundfile
from kokoro import KPipeline

# Every Kokoro runtime spells these letter by letter.
PRONUNCIATIONS = {"TODOs": "to dos", "TODO": "to do"}

REPO_ID = "hexgrad/Kokoro-82M"
SAMPLE_RATE = 24000
DEFAULT_LANG_CODE = "a"
IDLE_TIMEOUT = float(os.environ.get("NARRATE_WORKER_IDLE", "300"))
# How long accept() blocks before the idle check gets a turn.
ACCEPT_TIMEOUT = 1.0
BACKLOG = 64

socket_path = sys.argv[1]

# torch, huggingface and misaki all print to stdout, and the spawner sends both streams to the same
# log file; folding stdout in keeps that log in write order.
sys.stdout = sys.stderr

PRONUNCIATION_PATTERN = re.compile(r"\b(" + "|".join(PRONUNCIATIONS) + r")\b")

pipelines = {}
# KPipeline is not known to be thread-safe, so one synthesis runs at a time. Also guards `pipelines`.
synthesis_lock = threading.Lock()

activity_lock = threading.Lock()
last_activity = time.monotonic()
active_requests = 0
started_at = time.monotonic()
stopping = threading.Event()
claimed_socket_identity = None


def log(message):
    print(f"{time.strftime('%H:%M:%S')} {message}", file=sys.stderr, flush=True)


def pronounce(text):
    return PRONUNCIATION_PATTERN.sub(lambda match: PRONUNCIATIONS[match.group()], text)


# Voice ids are <language><gender>_<name>, so the first letter picks the pipeline.
def pipeline_for(voice):
    lang_code = voice[0]
    if lang_code not in pipelines:
        started = time.monotonic()
        pipelines[lang_code] = KPipeline(lang_code=lang_code, repo_id=REPO_ID)
        log(f"pipeline {lang_code} loaded in {time.monotonic() - started:.2f}s")
    return pipelines[lang_code]


def synthesize(text, voice, out):
    pipeline = pipeline_for(voice)
    segments = []
    words = []
    # KPipeline splits on blank lines and restarts token timestamps per piece.
    offset = 0.0

    for result in pipeline(pronounce(text), voice=voice):
        if result.audio is None:
            continue
        for token in result.tokens or []:
            word = token.text.strip()
            if not word or token.start_ts is None or token.end_ts is None:
                continue
            words.append({"text": word, "start": offset + token.start_ts, "end": offset + token.end_ts})
        audio = np.asarray(result.audio, dtype="float32")
        segments.append(audio)
        offset += len(audio) / SAMPLE_RATE

    if not segments:
        raise ValueError("kokoro produced no audio")

    soundfile.write(out, np.concatenate(segments), SAMPLE_RATE)
    return offset, words


def status():
    now = time.monotonic()
    with activity_lock:
        idle = now - last_activity
        in_flight = active_requests
    return {
        "pid": os.getpid(),
        "uptime": now - started_at,
        "idle": idle,
        "idleTimeout": IDLE_TIMEOUT,
        "inFlight": in_flight,
        "pipelines": sorted(pipelines),
    }


class Abandoned(Exception):
    pass


# A runner renders a whole narration at once, so killing it can strand 20 queued requests; each would
# otherwise hold the lock for its full synthesis with nobody left to answer.
def peer_gone(connection):
    try:
        return connection.recv(1, socket.MSG_PEEK | socket.MSG_DONTWAIT) == b""
    except BlockingIOError:
        return False
    except OSError:
        return True


def speak(request, connection):
    global active_requests
    with activity_lock:
        active_requests += 1

    try:
        with synthesis_lock:
            if peer_gone(connection):
                raise Abandoned
            started = time.monotonic()
            duration, words = synthesize(request["text"], request["voice"], request["out"])
            log(f"synthesized {duration:.2f}s of audio in {time.monotonic() - started:.2f}s")
    finally:
        with activity_lock:
            active_requests -= 1

    return {"wavPath": request["out"], "duration": duration, "words": words}


def handle(request, connection):
    op = request.get("op", "synthesize")
    if op == "synthesize":
        return speak(request, connection)
    if op == "status":
        return status()
    if op == "stop":
        stopping.set()
        return {"stopping": True}
    raise ValueError(f"unknown op: {op}")


# None means there is nobody left to reply to.
def respond(request, connection):
    try:
        return handle(request, connection)
    except Abandoned:
        log("caller gone before its turn, skipping")
        return None
    except Exception as error:
        return {"error": f"{type(error).__name__}: {error}"}


def serve(connection):
    global last_activity
    with activity_lock:
        last_activity = time.monotonic()

    try:
        stream = connection.makefile("rw")
        line = stream.readline()
        if line.strip():
            try:
                request = json.loads(line)
            except ValueError as error:
                response = {"error": f"unparseable request: {error}"}
            else:
                response = respond(request, connection)
            if response is not None:
                stream.write(json.dumps(response) + "\n")
                stream.flush()
    except OSError as error:
        # A caller that aborted, or a runner that was killed, drops the socket mid-synthesis.
        log(f"connection dropped: {error}")
    finally:
        with activity_lock:
            last_activity = time.monotonic()
        connection.close()


def idle_expired():
    with activity_lock:
        return active_requests == 0 and time.monotonic() - last_activity > IDLE_TIMEOUT


# A worker killed with SIGKILL leaves its socket file behind; only a socket nothing answers on is stale.
def claim():
    global claimed_socket_identity

    if os.path.exists(socket_path):
        probe = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        try:
            probe.connect(socket_path)
        except OSError:
            try:
                os.unlink(socket_path)
            except FileNotFoundError:
                pass
        else:
            return None
        finally:
            probe.close()

    server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        server.bind(socket_path)
    except OSError as error:
        server.close()
        log(f"another worker holds {socket_path}: {error}")
        return None
    bound = os.stat(socket_path)
    claimed_socket_identity = (bound.st_ino, bound.st_dev)
    server.listen(BACKLOG)
    return server


# The name can belong to a later worker by now, so only the file this one bound may be removed.
def release():
    try:
        current = os.stat(socket_path)
        if (current.st_ino, current.st_dev) == claimed_socket_identity:
            os.unlink(socket_path)
    except FileNotFoundError:
        pass


def main():
    server = claim()
    if server is None:
        log("worker already running, exiting")
        return

    try:
        # Bound before the model loads, so a caller that arrives during the load waits in the backlog
        # rather than deciding nothing is running and spawning a second worker.
        pipeline_for(DEFAULT_LANG_CODE)
        log(f"ready in {time.monotonic() - started_at:.2f}s, idle timeout {IDLE_TIMEOUT:.0f}s")

        server.settimeout(ACCEPT_TIMEOUT)
        while not stopping.is_set():
            try:
                connection, _ = server.accept()
            except TimeoutError:
                if idle_expired():
                    log(f"idle for {IDLE_TIMEOUT:.0f}s, exiting")
                    break
                continue
            threading.Thread(target=serve, args=(connection,), daemon=True).start()
    finally:
        server.close()
        release()


main()
