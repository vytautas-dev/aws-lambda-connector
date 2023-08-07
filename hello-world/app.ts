import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import AWS from 'aws-sdk';

//? Postman
// {
//     "args": [
//         {
//             "name": "name1",
//             "token": "token1",
//             "inputDocxName": "input1.docx"
//         },
//         {
//             "name": "name2",
//             "token": "token2",
//             "inputDocxName": "input2.docx"
//         }
//     ],
//     "bucketName": "00bucket",
//     "outputPdfName": "output1.pdf"
// }

type TInput = {
    name: string;
    token: string;
    bucketName: string;
    inputDocxName: string;
};

type TInputObj = {
    args: TInput[];
    bucketName: string;
    outputPdfName: string;
};

export const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {

        const { args, bucketName, outputPdfName}: TInputObj = JSON.parse(event.body || '{}');
        const convertedFiles: string[] = [];

        // Filler
        // sam local start-lambda --host 0.0.0.0.

        const lambdaFiller = new AWS.Lambda({
            apiVersion: '2015-03-31',
            endpoint: 'http://192.168.100.45:3001',
            sslEnabled: false
        })

        const dataToSendToFiller = args;

        for (const el of dataToSendToFiller) {
            try {
                const data = await lambdaFiller
                    .invoke({
                        FunctionName: 'Filler',
                        InvocationType: 'RequestResponse',
                        Payload: JSON.stringify({ ...el, bucketName }),
                    })
                    .promise();

                const payloadString = data.Payload ? data.Payload.toString() : '';
                const response = JSON.parse(payloadString);
                const convertedFile = JSON.parse(response.body).fileName;

                convertedFiles.push(convertedFile);
            } catch (err) {
                console.log('Error sending data:', err);
            }
        }

        //! Merger
        //? sam local start-lambda --host 0.0.0.0 --port 3002
        const lambdaMerger = new AWS.Lambda({
            apiVersion: '2015-03-31',
            endpoint: 'http://192.168.100.45:3002',
            sslEnabled: false,
        });

        const dataToSendToMerger = {
            args: [`--files=${[...convertedFiles]}`, `--bucket=${bucketName}`, `--filename=${outputPdfName}`],
        };

        await lambdaMerger
            .invoke({
                FunctionName: 'Merger',
                InvocationType: 'RequestResponse',
                Payload: JSON.stringify(dataToSendToMerger),
            }, function (err, data) {
                if (err) console.log(err);
                else console.log(`<----- Data sent successfully ${data} ----->`);
            })
            .promise();

        return {
            statusCode: 200,
            body: JSON.stringify({
                function: 'LambdaConnectorFunction',
                message: 'Files converted successfully',
                convertedFiles,
                // dataToMerge: dataToSendToMerger,
            }),
            headers: { 'content-type': 'application/json' },
        };
    } catch (err) {
        console.log('Error: ', err);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Internal Server Error',
            }),
        };
    }
};
