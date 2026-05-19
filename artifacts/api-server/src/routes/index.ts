import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import walletRouter from "./wallet.js";
import chatRouter from "./chat.js";
import pricesRouter from "./prices.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(walletRouter);
router.use(chatRouter);
router.use(pricesRouter);

export default router;
