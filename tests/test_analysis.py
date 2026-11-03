import json
import os
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from http.server import ThreadingHTTPServer
from finge.analysis import analyze, brief, parse_file
from server import Handler, ask_grok, sample_files

class AnalysisTests(unittest.TestCase):
    def test_fishcast_benchmark_contract(self):
        result = analyze(sample_files(), demo=True)
        self.assertEqual(result["summary"]["models"], 6)
        self.assertEqual(result["summary"]["positive_intervals"], 2)
        self.assertEqual(result["summary"]["best"]["track"], "nowcast")
        self.assertEqual(len(result["sources"][0]["sha256"]), 64)
        self.assertIn("SYNTHETIC DEMO", brief(result))
        self.assertIn("benchmark_table.csv / row", brief(result))

    def test_synthetic_label_survives_sample_upload(self):
        self.assertTrue(analyze(sample_files())["demo"])

    def test_inconclusive_is_not_improvement(self):
        result = analyze(sample_files())
        climate = [m for m in result["models"] if m["track"] == "climate"]
        self.assertTrue(all(m["status"] == "inconclusive" for m in climate))

    def test_metrics_preserves_missing_intervals(self):
        rows = parse_file("metrics.json", json.dumps({"model_name":"climate_conditioned_gp",
             "test_metrics":{"rmse":1.1,"rmse_skill_vs_constant":0.05,"pr_auc":0.2}}))
        self.assertEqual(rows[0]["track"], "climate")
        self.assertEqual(rows[0]["status"], "interval missing")

    def test_lag_flag_overrides_model_label(self):
        rows = parse_file("metrics.json", json.dumps({"model_name":"climate_conditioned_gp",
            "config":{"include_lag_features":True},"test_metrics":{"rmse":1.1}}))
        self.assertEqual(rows[0]["track"], "nowcast")

    def test_validation_only_is_rejected(self):
        with self.assertRaises(ValueError):
            parse_file("metrics.json", '{"val_metrics":{"rmse":0.01}}')

    def test_invalid_numbers_and_intervals_rejected(self):
        for extra in ["nan", "inf", "-1", "oops"]:
            with self.subTest(extra=extra), self.assertRaises(ValueError):
                parse_file("x.csv", "model,test_rmse\na," + extra)
        for body in ["a,1,0.2,0.1", "a,1,0.2,"]:
            with self.subTest(body=body), self.assertRaises(ValueError):
                parse_file("x.csv", "model,test_rmse,skill_ci_low,skill_ci_high\n" + body)

    def test_invalid_auc_rejected(self):
        with self.assertRaises(ValueError):
            parse_file("x.csv", "model,test_rmse,pr_auc\na,1,1.1")

    def test_unknown_track_is_not_climate(self):
        rows = parse_file("x.csv", "model,test_rmse\nnew_model,1")
        self.assertEqual(rows[0]["track"], "unknown")

    def test_json_shape_and_empty_csv_rejected(self):
        for name, content in [("x.json","[]"),("x.csv","model,test_rmse\n")]:
            with self.subTest(name=name), self.assertRaises(ValueError):
                parse_file(name, content)

    def test_same_basename_has_distinct_ids(self):
        files = sample_files() * 2
        result = analyze(files)
        self.assertEqual(len(set(m["id"] for m in result["models"])), 12)

    def test_missing_grok_key_is_not_fake_response(self):
        with patch.dict(os.environ, {}, clear=True), self.assertRaisesRegex(ValueError,"not connected"):
            ask_grok("Explain", analyze(sample_files()))

    def test_grok_request_contains_evidence_and_server_key(self):
        class Response:
            def __enter__(self): return self
            def __exit__(self,*args): pass
            def read(self): return b'{"choices":[{"message":{"content":"Evidence-based answer"}}]}'
        with patch.dict(os.environ, {"XAI_API_KEY":"test-secret","XAI_MODEL":"test-model"}):
            with patch("server.urlopen",return_value=Response()) as call:
                result = ask_grok("Explain",analyze(sample_files(),demo=True))
                request = call.call_args.args[0]
                sent = json.loads(request.data)
                self.assertEqual(sent["model"],"test-model")
                self.assertIn("benchmark_table.csv",sent["messages"][1]["content"])
                self.assertNotIn("test-secret",json.dumps(sent))
                self.assertEqual(result["answer"],"Evidence-based answer")

class HTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(("127.0.0.1",0),Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever,daemon=True)
        cls.thread.start()
        cls.url = "http://127.0.0.1:" + str(cls.server.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def post(self, path, data, **headers):
        req = Request(self.url + path, data=json.dumps(data).encode(),
                      headers={"Content-Type":"application/json",**headers})
        with urlopen(req) as response: return json.load(response)

    def test_demo_and_brief_endpoints(self):
        self.assertTrue(self.post("/api/analyze",{"demo":True})["demo"])
        self.assertIn("SYNTHETIC DEMO",self.post("/api/brief",{"demo":True})["markdown"])

    def test_malformed_import_returns_400(self):
        with self.assertRaises(HTTPError) as error:
            self.post("/api/analyze",{"files":[{"name":"x.json","content":"[]"}]})
        self.assertEqual(error.exception.code,400)

    def test_cross_origin_is_rejected(self):
        with self.assertRaises(HTTPError) as error:
            self.post("/api/analyze",{"demo":True},Origin="https://other.example")
        self.assertEqual(error.exception.code,403)

    def test_private_files_are_not_served(self):
        with self.assertRaises(HTTPError) as error:
            urlopen(self.url+"/server.py")
        self.assertEqual(error.exception.code,404)

if __name__ == "__main__":
    unittest.main()
