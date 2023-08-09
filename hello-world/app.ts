import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import AWS, { S3, Lambda } from 'aws-sdk';
import { v4 as uuid } from 'uuid';
import {TDataToFill, TGeneratedObject} from './types';

const bucketName = '00vytautas';

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

export const lambdaHandler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {

        const { template, organizationId, namespace, callbackEndpoint }: TGeneratedObject = JSON.parse(event.body || '{}');
        const { templateBody, documents } = template;
        const convertedFiles = [];

        // Filler
        // sam local start-lambda --host 0.0.0.0.
        // sam local start-lambda --host 0.0.0.0 --warm-containers LAZY

        for (const document of documents) {
            const fileID = uuid();
            const lambdaInvokeParams = {
                FunctionName: 'Filler',
                InvocationType: 'RequestResponse',
                Payload: JSON.stringify({ document, fileID, templateBody, bucketName})
            }
            const lambdaFiller = new Lambda({
                endpoint: 'http://192.168.100.45:3001'
            })

            const result = await lambdaFiller.invoke(lambdaInvokeParams).promise();
            const payloadString = result.Payload ? result.Payload.toString() : '';
            const response = JSON.parse(payloadString);
            const convertedFile = JSON.parse(response.body).fileName
            convertedFiles.push(convertedFile);
        }

        // Merger
        // sam local start-lambda --host 0.0.0.0 --port 3002

        const lambdaMerger = new AWS.Lambda({
            endpoint: 'http://192.168.100.45:3002',
        });

        const pdfID = uuid();
        const dataToSendToMerger = {
            args: [`--files=${[...convertedFiles]}`, `--bucket=${bucketName}`, `--filename=${pdfID}.pdf`],
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
                dataToMerge: dataToSendToMerger,
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
