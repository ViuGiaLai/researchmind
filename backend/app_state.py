class AppState:
    def __init__(self):
        self.engine = None
        self.bm25 = None
        self.vector = None
        self.hybrid = None
        self.retriever = None
        self.generator = None
        self.embedder = None
        self.embedder_ready = False
        self.init_message = "Khởi động..."
        self.build_progress: dict = {
            "phase": "idle",
            "current": 0,
            "total": 0,
            "percent": 0,
            "message": "",
        }
        self.build_cancelled: bool = False

state = AppState()
