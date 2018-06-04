import * as BigNumber from 'bignumber.js'
import * as debug from 'debug'
import * as dotenv from 'dotenv'
import * as express from 'express'
import { URL } from 'url'
import fetcher from '../node_modules/machinomy/dist/lib/util/fetcher'

const log = debug('paywall')

const HEADER_NAME = 'authorization'
const TOKEN_NAME = 'paywall'
const PREFIX = '/v1'

dotenv.config()

const GATEWAY_URL = process.env.GATEWAY_URL

function isAcceptUrl (url: string) {
  return url === PREFIX + '/accept'
}

function parseToken (req: express.Request, callback: (error: string | null, token?: string, meta?: string, price?: number) => void) {
  let content = req.get(HEADER_NAME)
  if (content) {
    let authorization = content.split(' ')
    let type = authorization[0].toLowerCase()
    let token = authorization[1]
    let meta = authorization[2]
    let price = parseInt(authorization[3], 10)
    if (type === TOKEN_NAME) {
      callback(null, token, meta, price)
    } else {
      callback(`Invalid ${HEADER_NAME} token name present. Expected ${TOKEN_NAME}, got ${type}`)
    }
  } else {
    callback(`No ${HEADER_NAME} header present`)
  }
}

export default class Paywall {
  receiverAccount: string
  base: URL

  constructor (receiverAccount: string, base: URL) {
    this.receiverAccount = receiverAccount
    this.base = base
  }

  guard (callback: express.RequestHandler): express.RequestHandler {
    let _guard = async (req: express.Request, res: express.Response, next: express.NextFunction, error: any, token?: string, meta?: string, price?: number) => {
      if (error || !token) {
        log(error)
      } else {
        const response = await fetcher.fetch(`${GATEWAY_URL}${PREFIX}/verify?token=${token}&meta=${meta}&price=${price}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        })

        if (response.status >= 200 && response.status < 300) {
          log('Got valid paywall token')
          callback(req, res, next)
        } else {
          log('Got invalid paywall token')
          this.paymentInvalid(req, res)
        }
      }
    }

    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      log(`Requested ${req.path}`)
      parseToken(req, (error, token, meta, price) => {
        return _guard(req, res, next, error, token, meta, price)
      })
    }
  }

  paymentInvalid (req: express.Request, res: express.Response) {
    res.status(409) // Conflict
      .send('Payment Invalid')
      .end()
  }

  middleware () {
    let handler: express.RequestHandler = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
      log('Called payment handler')
      try {
        const response = await fetcher.fetch(`${GATEWAY_URL}${PREFIX}/accept`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify(req.body)
        })
        log('Accept request')
        const json = await response.json()
        res.status(202).header('Paywall-Token', json.token).send(json)
      } catch (e) {
        log('Reject request', e)
        next(e)
      }
    }

    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (isAcceptUrl(req.url)) {
        handler(req, res, next)
      } else {
        next()
      }
    }
  }

}
