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

state = AppState()
