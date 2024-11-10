


var fs = require('fs'); 
var parse = require('csv-parse');

var csvData=[];
var filename ='gapAnalysisQuestions.js'
fs.createReadStream('C:\\GIT\\Projects\\StandAlone\\csr\\Docs\\GapAnalysisv2.csv')
    .pipe(parse({delimiter: ','}))
    .on('data', function(csvrow) {
        //do something with csvrow
         
        var obj =`
        v_1_${csvrow[2]}: {
            value: 'v_1_${csvrow[2]}',
            label: \`${csvrow[3].trim()}\`,
            coreSubject: coreSubjectNames.${csvrow[0]}.key,
            isuueOfInterest: issueOfInterest.${csvrow[1]}.key,
            orderby: ${csvrow[4]},
            noDocument: false,
            groupby : ${csvrow[5]},
            dropdown : ${csvrow[6]},
            doclabel: \`${csvrow[9].trim()}\`,
          },
        
        `
        console.log(obj);

        fs.appendFileSync(filename, obj);


    })
    .on('end',function() {
      //do something with csvData
      console.log(csvData);
    });